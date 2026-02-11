
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import { decode, decodeAudioData, createBlob, playTone, exportWav } from '../services/audioUtils';
import { GEMINI_MODEL, getAccentAdjustedInstruction } from '../constants';
import { BusinessConfig, OrderStatus } from '../types';

interface VoiceInterfaceProps {
  onClose: () => void;
  config: BusinessConfig;
}

type ConnectionStatus = 'Idle' | 'Initializing' | 'MicRequest' | 'ConnectingAPI' | 'Listening' | 'Processing' | 'Speaking' | 'Error';
type AccentRegion = 'Dhaka' | 'Chittagong' | 'Sylhet';
type VoiceName = 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';

interface TranscriptItem {
  text: string;
  role: 'user' | 'ai';
  id: string;
  isVerified?: boolean;
  translation?: string;
}

const SUGGESTED_TOPICS = [
  { text: "ডেলিভারি চার্জ কত?", icon: "fa-truck-fast" },
  { text: "অর্ডার ট্র্যাকিং করব কিভাবে?", icon: "fa-location-dot" },
  { text: "রিটার্ন পলিসি কি?", icon: "fa-rotate-left" },
  { text: "বিকাশে পেমেন্ট করা যাবে?", icon: "fa-wallet" }
];

const TypewriterText: React.FC<{ text: string, delay?: number }> = ({ text, delay = 0.04 }) => {
  const words = text.split(' ');
  return (
    <div className="flex flex-wrap gap-x-1.5">
      {words.map((word, i) => (
        <span key={i} className="word-animate opacity-0" style={{ animationDelay: `${i * delay}s` }}>
          {word}
        </span>
      ))}
    </div>
  );
};

const VoiceInterface: React.FC<VoiceInterfaceProps> = ({ onClose, config }) => {
  const [isActive, setIsActive] = useState(false);
  const [transcriptions, setTranscriptions] = useState<TranscriptItem[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>('Idle');
  const [selectedAccent, setSelectedAccent] = useState<AccentRegion>('Dhaka');
  const [isAutoDetecting, setIsAutoDetecting] = useState(true);
  const [detectedAccent, setDetectedAccent] = useState<AccentRegion | null>(null);
  const [speechRate, setSpeechRate] = useState(1.0);
  const [typingSpeed, setTypingSpeed] = useState(0.04);
  const [lastVerifiedFact, setLastVerifiedFact] = useState<string | null>(null);
  const [isTraining, setIsTraining] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [isTrained, setIsTrained] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [selectedRecordingFormat, setSelectedRecordingFormat] = useState<'webm' | 'wav'>('webm'); // New state for recording format
  const [showTranslations, setShowTranslations] = useState(true);
  const [translationQualityLevel, setTranslationQualityLevel] = useState<'standard' | 'literal' | 'idiomatic'>('standard');
  const [notification, setNotification] = useState<{message: string, type: 'email' | 'info'} | null>(null);
  const [micPermissionGranted, setMicPermissionGranted] = useState<boolean | null>(null);
  const [micPermissionError, setMicPermissionError] = useState<string | null>(null);
  const [translationMemory, setTranslationMemory] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('translation_memory_bd');
    return saved ? JSON.parse(saved) : {};
  });
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [selectedVoiceName, setSelectedVoiceName] = useState<VoiceName>('Kore');
  const [voicePitch, setVoicePitch] = useState(0);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<{ input: AudioContext; output: AudioContext; } | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const transcriptionsEndRef = useRef<HTMLDivElement>(null);
  const currentAiTranscription = useRef('');
  const currentUserTranscription = useRef('');
  const initialAccentRef = useRef(selectedAccent);

  const sendEmailNotification = useCallback((subject: string, body: string) => {
    console.log(`%c[EMAIL SERVICE]%c Sending Email to: merchant@${config.shopName.toLowerCase().replace(/\s/g, '')}.com`, "color: #6366f1; font-weight: bold", "color: inherit");
    setNotification({ message: 'Email notification sent to owner', type: 'email' });
    setTimeout(() => setNotification(null), 3000);
  }, [config.shopName]);

  useEffect(() => {
    if (selectedAccent !== initialAccentRef.current) {
      sendEmailNotification(
        `Accent Updated for ${config.shopName} Agent`,
        `The active dialect for your voice agent has been updated to: ${selectedAccent}.`
      );
      initialAccentRef.current = selectedAccent;
    }
  }, [selectedAccent, config.shopName, sendEmailNotification]);

  useEffect(() => {
    if (isTrained) {
      sendEmailNotification(
        `Voice DNA Injection Complete - ${config.shopName}`,
        `Your voice agent has successfully completed the voice cloning and dialect calibration process.`
      );
    }
  }, [isTrained, config.shopName, sendEmailNotification]);

  useEffect(() => {
    localStorage.setItem('translation_memory_bd', JSON.stringify(translationMemory));
  }, [translationMemory]);

  useEffect(() => {
    transcriptionsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcriptions, status]);

  const drawWaveform = useCallback(() => {
    if (!canvasRef.current || !analyserRef.current || status !== 'Speaking') return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const renderFrame = () => {
      if (status !== 'Speaking') {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      requestAnimationFrame(renderFrame);
      analyserRef.current?.getByteFrequencyData(dataArray);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2;
        ctx.fillStyle = `rgb(79, 70, 229)`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };
    renderFrame();
  }, [status]);

  useEffect(() => {
    if (status === 'Speaking') drawWaveform();
  }, [status, drawWaveform]);

  const fetchTranslation = useCallback(async (text: string) => {
    if (translationMemory[text]) return translationMemory[text];
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      let promptInstruction = `Translate this Bengali customer service phrase to clear English concisely: "${text}"`;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: promptInstruction,
        config: { temperature: 0.1 }
      });
      const result = response.text?.trim();
      if (result) {
        setTranslationMemory(prev => ({ ...prev, [text]: result }));
        return result;
      }
      return null;
    } catch (e) {
      return null;
    }
  }, [translationMemory]);

  const addTranscription = useCallback(async (text: string, role: 'user' | 'ai', isVerified?: boolean) => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2, 9);
    const newItem: TranscriptItem = { id, text, role, isVerified };
    setTranscriptions(prev => [...prev, newItem]);
    if (showTranslations && role === 'ai') {
      const translation = await fetchTranslation(text);
      if (translation) {
        setTranscriptions(prev => prev.map(item => (item.id === id ? { ...item, translation } : item)));
      }
    }
  }, [showTranslations, fetchTranslation]);

  const verifyFact = (text: string) => {
    const lowerText = text.toLowerCase();
    const facts = [
      { key: config.shopName.toLowerCase(), label: "Shop Identity" },
      { key: config.bkashNumber, label: "Payment Info" },
      { key: config.deliveryInsideDhaka.toString(), label: "Pricing" },
      { key: config.deliveryOutsideDhaka.toString(), label: "Pricing" }
    ];
    const found = facts.find(f => lowerText.includes(f.key));
    if (found) {
      setLastVerifiedFact(found.label);
      setTimeout(() => setLastVerifiedFact(null), 3000);
      return true;
    }
    return false;
  };

  const handleSaveTranscript = useCallback(() => {
    if (transcriptions.length === 0) return;
    const filename = `Transcript_${config.shopName}_${Date.now()}.txt`;
    const transcriptText = transcriptions.map(t => `${t.role.toUpperCase()}: ${t.text}${t.translation ? ` (${t.translation})` : ''}`).join('\n\n');
    const blob = new Blob([transcriptText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }, [transcriptions, config.shopName]);

  const startRecording = useCallback(() => {
    if (!recordingDestRef.current) return;
    recordedChunksRef.current = [];
    // Always record to webm internally for browser MediaRecorder compatibility
    const mediaRecorder = new MediaRecorder(recordingDestRef.current.stream, {
      mimeType: 'audio/webm;codecs=opus'
    });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    mediaRecorder.onstop = async () => {
      if (!audioContextRef.current?.output) {
        console.error("Output AudioContext not available for recording export.");
        return;
      }

      const audioBlob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
      let finalBlob: Blob | null = null;
      let filename = `Call_Recording_${config.shopName}_${new Date().toISOString()}`;
      
      try {
        if (selectedRecordingFormat === 'wav') {
          // Decode the webm blob into an AudioBuffer, then export as WAV
          const audioBuffer = await audioContextRef.current.output.decodeAudioData(await audioBlob.arrayBuffer());
          finalBlob = await exportWav(audioBuffer);
          filename += '.wav';
        } else { // Default to webm
          finalBlob = audioBlob;
          filename += '.webm';
        }

        if (finalBlob) {
          const url = URL.createObjectURL(finalBlob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          link.click();
          URL.revokeObjectURL(url);
          setNotification({ message: `Recording saved as ${selectedRecordingFormat.toUpperCase()}!`, type: 'info' });
          setTimeout(() => setNotification(null), 3000);
        }
      } catch (error) {
        console.error("Error processing recording for export:", error);
        setNotification({ message: `Error saving recording: ${error instanceof Error ? error.message : String(error)}`, type: 'info' });
        setTimeout(() => setNotification(null), 5000);
      } finally {
        recordedChunksRef.current = [];
        setIsRecording(false);
      }
    };
    mediaRecorder.start();
    recorderRef.current = mediaRecorder;
    setIsRecording(true);
  }, [config.shopName, selectedRecordingFormat]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  const stopSession = useCallback(() => {
    stopRecording();
    sessionPromiseRef.current?.then(s => s.close?.()).catch(() => {});
    sessionPromiseRef.current = null;
    audioContextRef.current?.input.close().catch(() => {});
    audioContextRef.current?.output.close().catch(() => {});
    audioContextRef.current = null;
    recordingDestRef.current = null;
    sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
    sourcesRef.current.clear();
    setIsActive(false);
    setIsConnecting(false);
    setStatus('Idle');
    nextStartTimeRef.current = 0;
    setDetectedAccent(null);
    setMicPermissionGranted(null);
    setIsAgentTyping(false);
  }, [stopRecording]);

  const startSession = async (initialText?: string) => {
    if (isConnecting || isActive) return;
    setIsConnecting(true);
    setStatus('Initializing');
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermissionGranted(true);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const analyser = outputCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      const recordingDest = outputCtx.createMediaStreamDestination();
      recordingDestRef.current = recordingDest;
      audioContextRef.current = { input: inputCtx, output: outputCtx };
      
      // Create a mic source in the OUTPUT context for recording to avoid cross-context errors
      const micSourceForRecording = outputCtx.createMediaStreamSource(stream);
      micSourceForRecording.connect(recordingDest);

      setStatus('ConnectingAPI');
      const sessionConnectPromise = ai.live.connect({
        model: GEMINI_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          tools: [{
            functionDeclarations: [
              { name: 'check_order_status', parameters: { type: Type.OBJECT, properties: { order_id: { type: Type.STRING } }, required: ['order_id'] } },
              { name: 'detect_accent', parameters: { type: Type.OBJECT, properties: { accent: { type: Type.STRING, enum: ['Dhaka', 'Chittagong', 'Sylhet'] } }, required: ['accent'] } },
              { name: 'switch_accent', parameters: { type: Type.OBJECT, properties: { accent: { type: Type.STRING, enum: ['Dhaka', 'Chittagong', 'Sylhet'] } }, required: ['accent'] } },
              { name: 'save_transcript', parameters: { type: Type.OBJECT } }
            ]
          }],
          speechConfig: { 
            voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoiceName } },
            ...(voicePitch !== 0 && { pitch: voicePitch }),
          },
          systemInstruction: getAccentAdjustedInstruction(selectedAccent, config) + 
            "\n\nVOICE COMMANDS: Support 'change accent to [Region]' and 'save transcript'.",
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsActive(true);
            setIsConnecting(false);
            setStatus('Listening');
            playTone(outputCtx, 660, 0.3);
            if (initialText) {
              sessionConnectPromise.then(s => s.sendRealtimeInput({ text: initialText }));
              addTranscription(initialText, 'user');
            }
            // Use the inputCtx only for the stream to Gemini
            const micSourceForGemini = inputCtx.createMediaStreamSource(stream!);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const pcmBlob = createBlob(e.inputBuffer.getChannelData(0));
              sessionConnectPromise.then(s => s.sendRealtimeInput({ media: pcmBlob }));
            };
            micSourceForGemini.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: any) => {
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'check_order_status') {
                   const result = { id: fc.args.order_id, status: 'Shipped', eta: '2 days' };
                   sessionConnectPromise.then(s => s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result } } }));
                } else if (fc.name === 'detect_accent' || fc.name === 'switch_accent') {
                  const newAccent = fc.args.accent as AccentRegion;
                  setSelectedAccent(newAccent);
                  setDetectedAccent(newAccent);
                  setIsAutoDetecting(false);
                  sessionConnectPromise.then(s => s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: "ok" } } }));
                } else if (fc.name === 'save_transcript') {
                  handleSaveTranscript();
                  sessionConnectPromise.then(s => s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: "saved" } } }));
                }
              }
            }
            if (message.serverContent?.outputTranscription) {
              currentAiTranscription.current += message.serverContent.outputTranscription.text;
              if (status !== 'Speaking') setIsAgentTyping(true);
            } else if (message.serverContent?.inputTranscription) {
              currentUserTranscription.current += message.serverContent.inputTranscription.text;
            }
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && outputCtx) {
                setIsAgentTyping(false);
                setStatus('Speaking');
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
                const audioBuffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1);
                const source = outputCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.playbackRate.value = speechRate;
                source.connect(analyser).connect(outputCtx.destination);
                source.connect(recordingDest); // CONNECT AI OUTPUT TO RECORDING MIXER
                source.addEventListener('ended', () => {
                  sourcesRef.current.delete(source);
                  if (sourcesRef.current.size === 0 && currentAiTranscription.current === '') setStatus('Listening');
                });
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += (audioBuffer.duration / speechRate);
                sourcesRef.current.add(source);
            }
            if (message.serverContent?.turnComplete) {
              if (currentUserTranscription.current) {
                addTranscription(currentUserTranscription.current, 'user');
                currentUserTranscription.current = '';
                setStatus('Processing');
              }
              if (currentAiTranscription.current) {
                const text = currentAiTranscription.current;
                addTranscription(text, 'ai', verifyFact(text));
                currentAiTranscription.current = '';
                setIsAgentTyping(false);
                if (sourcesRef.current.size === 0) setStatus('Listening');
              } else if (!base64Audio) setIsAgentTyping(false);
            }
          },
          onerror: () => { stopSession(); setStatus('Error'); },
          onclose: () => stopSession(),
        },
      });
      sessionPromiseRef.current = sessionConnectPromise;
    } catch (err) {
      setIsConnecting(false);
      setStatus('Error');
      setMicPermissionGranted(false);
      if (stream) stream.getTracks().forEach(t => t.stop());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className={`bg-white w-full max-w-xl h-[720px] rounded-[40px] shadow-2xl flex flex-col overflow-hidden border border-white/20 relative`}>
        {notification && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[110] bg-slate-900/95 backdrop-blur text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/10 animate-in slide-in-from-top-4 duration-500">
             <div className="w-8 h-8 rounded-xl bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <i className={`fa-solid ${notification.type === 'email' ? 'fa-envelope-circle-check' : 'fa-info-circle'} text-xs`}></i>
             </div>
             <p className="text-[11px] font-black uppercase tracking-wider">{notification.message}</p>
          </div>
        )}
        {lastVerifiedFact && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[100] bg-green-500 text-white px-5 py-2.5 rounded-2xl shadow-xl flex items-center gap-3 animate-in slide-in-from-top-4 duration-500">
             <i className="fa-solid fa-certificate animate-spin [animation-duration:3s]"></i>
             <p className="text-xs font-black uppercase tracking-widest">Verified {lastVerifiedFact}</p>
          </div>
        )}
        {detectedAccent && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[100] bg-indigo-600 text-white px-6 py-3 rounded-2xl shadow-xl flex items-center gap-4 animate-in zoom-in-75 duration-500">
             <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center"><i className="fa-solid fa-ear-listen animate-pulse"></i></div>
             <div><p className="text-[10px] font-black uppercase opacity-60">Dialect Identified</p><p className="text-sm font-black">{detectedAccent} Accent Applied</p></div>
          </div>
        )}
        <div className={`p-8 flex items-center justify-between text-white shrink-0 ${status === 'Speaking' ? 'bg-orange-500' : 'bg-slate-900'} transition-colors duration-500`}>
          <div className="flex items-center gap-5">
            <div className={`relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 border-2 ${status === 'Speaking' ? 'bg-white text-orange-500 speaking-active shadow-2xl border-orange-200' : 'bg-white/10 text-white border-transparent'}`}>
               {status === 'Speaking' && <div className="absolute inset-0 rounded-2xl border-4 border-white/50 animate-ping opacity-30"></div>}
               <i className={`fa-solid ${status === 'Speaking' ? 'fa-comment-dots' : 'fa-robot'} text-xl relative z-10`}></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-black text-xl">{config.shopName} Agent</h2>
                {status === 'Speaking' && <span className="flex items-center gap-1 bg-white/20 px-1.5 py-0.5 rounded-md"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span><span className="text-[8px] font-black uppercase tracking-tighter">Live</span></span>}
              </div>
              <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest flex items-center gap-2">
                {status} 
                {isAgentTyping && <span className="flex items-center gap-1"><span className="w-1 h-1 bg-white rounded-full dot-elastic-animate" style={{ animationDelay: '0s' }}></span><span className="w-1 h-1 bg-white rounded-full dot-elastic-animate" style={{ animationDelay: '0.1s' }}></span><span className="w-1 h-1 bg-white rounded-full dot-elastic-animate" style={{ animationDelay: '0.2s' }}></span></span>}
                {isActive && isAutoDetecting && (
                  <span className="inline-flex items-center text-indigo-400">
                    <i className="fa-solid fa-spinner fa-spin text-[8px] mr-1"></i> Auto-detecting Accent
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isActive && (
              <>
                <button onClick={isRecording ? stopRecording : startRecording} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isRecording ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/50' : 'bg-white/10 text-white hover:bg-white/20'}`} title={isRecording ? "Stop Recording" : "Start Call Recording"}>
                  <i className={`fa-solid ${isRecording ? 'fa-square' : 'fa-circle'} text-sm`}></i>
                </button>
                <button onClick={handleSaveTranscript} className="w-10 h-10 rounded-xl bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition-all" title="Save Transcript"><i className="fa-solid fa-download text-sm"></i></button>
              </>
            )}
            <button onClick={() => { stopSession(); onClose(); }} className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"><i className="fa-solid fa-times text-lg"></i></button>
          </div>
        </div>
        <canvas ref={canvasRef} height="40" className="w-full bg-slate-50 border-b border-slate-100" />
        <div className="bg-slate-50 border-b border-slate-200 px-8 py-3.5 shrink-0 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Controls</span>
             <div className="h-4 w-px bg-slate-200"></div>
             <button onClick={() => setShowTranslations(!showTranslations)} className={`text-[9px] font-black uppercase px-2 py-1 rounded border transition-all ${showTranslations ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-400'}`}><i className="fa-solid fa-language mr-1.5"></i> Translations</button>
             {Object.keys(translationMemory).length > 0 && (
                 <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1">
                   <i className="fa-solid fa-brain text-[8px]"></i> {Object.keys(translationMemory).length} entries
                 </span>
               )}
               {showTranslations && (
                 <select 
                   value={translationQualityLevel} 
                   onChange={(e) => setTranslationQualityLevel(e.target.value as typeof translationQualityLevel)}
                   className="ml-2 px-2 py-1 rounded border border-slate-200 bg-white text-slate-600 text-[9px] font-black uppercase outline-none focus:border-indigo-500 transition-all"
                 >
                   <option value="standard">Standard</option>
                   <option value="literal">Literal</option>
                   <option value="idiomatic">Idiomatic</option>
                 </select>
               )}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2" title="Select Voice">
                <i className="fa-solid fa-ear-muffs text-slate-400 text-[10px]"></i>
                <select 
                  value={selectedVoiceName} 
                  onChange={(e) => setSelectedVoiceName(e.target.value as VoiceName)}
                  className="px-2 py-1 rounded border border-slate-200 bg-white text-slate-600 text-[9px] font-black uppercase outline-none focus:border-indigo-500 transition-all"
                >
                  <option value="Kore">Kore</option>
                  <option value="Puck">Puck</option>
                  <option value="Charon">Charon</option>
                  <option value="Fenrir">Fenrir</option>
                  <option value="Zephyr">Zephyr</option>
                </select>
              </div>
            <div className="flex items-center gap-2" title="Voice Pitch"><i className="fa-solid fa-wave-square text-slate-400 text-[10px]"></i><input type="range" min="-10" max="10" step="1" value={voicePitch} onChange={(e) => setVoicePitch(parseFloat(e.target.value))} className="w-16 h-1 accent-purple-600 appearance-none bg-slate-200 rounded-full" /></div>
            <div className="flex items-center gap-2" title="Speech Speed"><i className="fa-solid fa-gauge-high text-slate-400 text-[10px]"></i><input type="range" min="0.5" max="2.0" step="0.1" value={speechRate} onChange={(e) => setSpeechRate(parseFloat(e.target.value))} className="w-16 h-1 accent-indigo-600 appearance-none bg-slate-200 rounded-full" /></div>
            <div className="flex items-center gap-2" title="Text Reveal Speed"><i className="fa-solid fa-keyboard text-slate-400 text-[10px]"></i><input type="range" min="0.01" max="0.2" step="0.01" value={typingSpeed} onChange={(e) => setTypingSpeed(parseFloat(e.target.value))} className="w-16 h-1 accent-orange-600 appearance-none bg-slate-200 rounded-full" /></div>
            
            {/* New Recording Format Selection */}
            <div className="flex items-center gap-2" title="Recording Format">
              <i className="fa-solid fa-file-audio text-slate-400 text-[10px]"></i>
              <select
                value={selectedRecordingFormat}
                onChange={(e) => setSelectedRecordingFormat(e.target.value as 'webm' | 'wav')}
                className="px-2 py-1 rounded border border-slate-200 bg-white text-slate-600 text-[9px] font-black uppercase outline-none focus:border-indigo-500 transition-all"
              >
                <option value="webm">WebM (Opus)</option>
                <option value="wav">WAV (PCM)</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-hide bg-slate-50/50">
          {!isActive && !isConnecting && (
            <div className="space-y-10">
              {micPermissionGranted === false ? (
                <div className="bg-red-50 border border-red-200 rounded-[32px] p-8 text-center shadow-sm space-y-6 animate-in fade-in duration-500">
                  <i className="fa-solid fa-microphone-slash text-red-500 text-5xl"></i>
                  <h4 className="text-xl font-black text-red-800">Microphone Access Required</h4>
                  <p className="text-sm font-medium text-red-700 leading-relaxed">{micPermissionError || "We need access to your microphone to enable voice communication. Please grant permission in your browser settings to use the voice agent."}</p>
                  <button 
                    onClick={() => startSession()} 
                    className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-red-600/20 transition-all"
                  >
                    Grant Microphone Access
                  </button>
                  <p className="text-[10px] text-red-500 font-bold mt-4">If permission dialog does not appear, check your browser settings.</p>
                </div>
              ) : (
                <>
                  {/* Voice Cloning Settings Section */}
                  <div className="bg-white border border-slate-200 rounded-[32px] p-8 shadow-sm">
                    <h4 className="text-xs font-black uppercase text-slate-400 mb-6 flex items-center gap-3"><i className="fa-solid fa-waveform text-indigo-500"></i> Voice Cloning Settings</h4>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Agent Dialect</p>
                    <div className="grid grid-cols-3 gap-3 mb-8">
                      {['Dhaka', 'Chittagong', 'Sylhet'].map(accent => (
                        <button key={accent} onClick={() => { setSelectedAccent(accent as AccentRegion); setIsAutoDetecting(false); }} className={`py-4 rounded-2xl text-[10px] font-black border transition-all ${selectedAccent === accent ? 'bg-indigo-600 text-white shadow-xl scale-105 border-indigo-600' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>{accent}</button>
                      ))}
                    </div>
                    <div className="flex items-center justify-between mb-8 px-2">
                      <span className="text-[10px] font-black uppercase text-slate-400">Auto-Detect Dialect</span>
                      <button 
                        onClick={() => setIsAutoDetecting(!isAutoDetecting)}
                        className={`w-12 h-6 rounded-full transition-all relative ${isAutoDetecting ? 'bg-indigo-600' : 'bg-slate-200'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isAutoDetecting ? 'right-1' : 'left-1 shadow-sm'}`}></div>
                      </button>
                    </div>
                    {isTraining ? (
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-600 transition-all" style={{ width: `${trainingProgress}%` }}></div>
                      </div>
                    ) : (
                      <button onClick={() => { setIsTraining(true); setTrainingProgress(0); const i = setInterval(() => setTrainingProgress(p => { if (p >= 100) { clearInterval(i); setIsTraining(false); setIsTrained(true); return 100; } return p + 10; }), 100); }} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest">Inject Voice DNA</button>
                    )}
                    {isTrained && <p className="mt-4 text-center text-[10px] font-black text-green-600 uppercase tracking-widest"><i className="fa-solid fa-check-circle mr-2"></i> Calibration Successful</p>}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
                    <p className="col-span-2 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Quick Start Prompts</p>
                    {SUGGESTED_TOPICS.map((t, i) => (
                      <button key={i} onClick={() => startSession(t.text)} className="p-4 bg-white border border-slate-100 rounded-2xl text-[11px] font-bold hover:shadow-lg transition-all flex flex-col items-center gap-2 group">
                        <i className={`fa-solid ${t.icon} text-indigo-500 text-lg group-hover:scale-125 transition-transform`}></i> {t.text}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {transcriptions.map((t) => (
            <div key={t.id} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2`}>
              <div className={`max-w-[85%] p-5 rounded-[28px] text-sm shadow-sm relative ${t.role === 'user' ? 'bg-slate-900 text-white rounded-tr-none' : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none'}`}>
                {t.isVerified && <div className="absolute -top-2 -right-2 bg-green-500 text-white w-5 h-5 rounded-full flex items-center justify-center border-2 border-white text-[8px]"><i className="fa-solid fa-check"></i></div>}
                <div className="font-bold leading-relaxed">
                  {t.role === 'ai' ? <TypewriterText text={t.text} delay={typingSpeed} /> : t.text}
                </div>
                {showTranslations && t.translation && (
                  <div className="mt-2 pt-2 border-t border-slate-100/20 text-[11px] font-medium opacity-60 italic animate-in fade-in duration-700">
                    {t.translation}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={transcriptionsEndRef} />
        </div>

        <div className="p-8 bg-white border-t border-slate-100 shrink-0">
          {isActive ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-tighter flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${status === 'Speaking' ? 'bg-orange-500' : status === 'Listening' ? 'bg-green-500' : 'bg-blue-500'} animate-pulse`}></span>
                  {status}
                </span>
                {isRecording && <span className="flex items-center gap-1.5 text-[9px] font-black uppercase text-red-500"><i className="fa-solid fa-record-vinyl animate-spin"></i> Recording Live</span>}
              </div>
              <button onClick={stopSession} className="px-8 py-3.5 bg-red-500 text-white rounded-2xl font-black text-xs uppercase shadow-lg shadow-red-500/20 active:scale-95 transition-all">End Call</button>
            </div>
          ) : (
            <button 
              onClick={() => startSession()} 
              disabled={isConnecting || micPermissionGranted === false} 
              className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-3xl font-black text-lg shadow-xl shadow-indigo-600/20 transition-all"
            >
              {isConnecting ? <i className="fa-solid fa-circle-notch fa-spin mr-3"></i> : <i className="fa-solid fa-bolt mr-3"></i>}
              {isConnecting ? 'Linking Server...' : 'Connect Voice Agent'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default VoiceInterface;