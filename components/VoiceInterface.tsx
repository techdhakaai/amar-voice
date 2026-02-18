
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import { decode, decodeAudioData, playTone } from '../services/audioUtils';
import { GEMINI_MODEL, getAccentAdjustedInstruction } from '../constants';
import { BusinessConfig, Lead, ImageInteraction } from '../types'; // Import ImageInteraction

interface VoiceInterfaceProps {
  onClose: () => void;
  config: BusinessConfig;
  onLeadCaptured?: (lead: Lead) => void;
}

type ConnectionStatus = 'Idle' | 'Initializing' | 'Connecting' | 'Listening' | 'Processing' | 'Speaking' | 'Error';

const VoiceInterface: React.FC<VoiceInterfaceProps> = ({ onClose, config, onLeadCaptured }) => {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>('Idle');
  const [isSendingImage, setIsSendingImage] = useState(false);
  const [isMuted, setIsMuted] = useState(false); 
  const [notification, setNotification] = useState<string | null>(null);
  const [currentInputTranscription, setCurrentInputTranscription] = useState('');
  const [currentOutputTranscription, setCurrentOutputTranscription] = useState('');
  const [speechRate, setSpeechRate] = useState<number>(1.0); 
  const [imageHistory, setImageHistory] = useState<ImageInteraction[]>([]); 
  
  const audioContextRef = useRef<{ input: AudioContext; output: AudioContext; } | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notificationTimeoutRef = useRef<number | null>(null);
  const isMutedRef = useRef(isMuted);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const lastSentImageIdRef = useRef<string | null>(null); 

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const showNotification = useCallback((message: string, duration: number = 3000, isError: boolean = false) => {
    setNotification(message);
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
    }
    // Set duration to 0 for persistent error messages
    if (duration !== 0) {
      notificationTimeoutRef.current = window.setTimeout(() => {
        setNotification(null);
        notificationTimeoutRef.current = null;
      }, duration);
    } else {
      notificationTimeoutRef.current = null; // Clear timeout if message is persistent
    }
  }, []);

  const stopSession = useCallback(() => {
    sessionPromiseRef.current?.then(s => s.close?.()).catch(() => {});
    sessionPromiseRef.current = null;
    
    if (audioWorkletNodeRef.current) {
      audioWorkletNodeRef.current.port.onmessage = null;
      audioWorkletNodeRef.current.disconnect();
      audioWorkletNodeRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.input.close().catch(() => {});
      audioContextRef.current.output.close().catch(() => {});
      audioContextRef.current = null;
    }
    setIsActive(false);
    setStatus('Idle');
    setIsMuted(false);
    setCurrentInputTranscription('');
    setCurrentOutputTranscription('');
    setImageHistory([]); 
    lastSentImageIdRef.current = null; 
    setNotification(null);
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
      notificationTimeoutRef.current = null;
    }
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !sessionPromiseRef.current) return;

    setIsSendingImage(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = (reader.result as string).split(',')[1];
      const interactionId = Math.random().toString(36).substring(2, 9);

      const newInteraction: ImageInteraction = {
        id: interactionId,
        timestamp: new Date(),
        userImage: { data: base64Data, mimeType: file.type },
      };
      
      setImageHistory(prev => [newInteraction, ...prev]);
      lastSentImageIdRef.current = interactionId; 

      try {
        const session = await sessionPromiseRef.current;
        session.sendRealtimeInput({
          media: { data: base64Data, mimeType: file.type }
        });
        if (audioContextRef.current) playTone(audioContextRef.current.output, 880, 0.1);
        
        showNotification("Image received! Analyzing...", 4000);
      } catch (err) {
        console.error("Failed to send image:", err);
        showNotification("Failed to upload image. Please try again.", 3000, true);
        setImageHistory(prev => prev.filter(item => item.id !== interactionId));
        if (lastSentImageIdRef.current === interactionId) {
          lastSentImageIdRef.current = null;
        }
      } finally {
        setIsSendingImage(false);
        if (fileInputRef.current) { 
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const newState = !prev;
      if (newState) {
        showNotification("Microphone muted.", 3000);
      } else {
        showNotification("Microphone unmuted.", 3000);
      }
      return newState;
    });
  }, [showNotification]);

  const startSession = async () => {
    if (isActive) return;
    setStatus('Initializing');
    setNotification(null);
    setCurrentInputTranscription('');
    setCurrentOutputTranscription('');
    setImageHistory([]); 
    lastSentImageIdRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = { input: inputCtx, output: outputCtx };

      await inputCtx.audioWorklet.addModule('audio-recorder.js');

      const audioWorkletNode = new AudioWorkletNode(inputCtx, 'audio-recorder-processor');
      audioWorkletNodeRef.current = audioWorkletNode;

      setStatus('Connecting');
      const sessionPromise = ai.live.connect({
        model: GEMINI_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: getAccentAdjustedInstruction('Dhaka', config),
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
            speakingRate: speechRate, 
          },
          tools: [{
            functionDeclarations: [{
              name: 'save_lead',
              description: 'Save customer phone number and interest.',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  phone: { type: Type.STRING, description: 'Format: 01XXXXXXXXX' },
                  interest: { type: Type.STRING },
                  location: { type: Type.STRING, description: 'Customer\'s location (e.g., city, district)' }
                },
                required: ['phone']
              }
            }]
          }]
        },
        callbacks: {
          onopen: () => {
            setIsActive(true);
            setStatus('Listening');
            setIsMuted(false);

            const source = inputCtx.createMediaStreamSource(stream);
            source.connect(audioWorkletNode);
            audioWorkletNode.connect(inputCtx.destination); 

            audioWorkletNode.port.onmessage = (event) => {
              const pcmBlob = event.data;
              if (!isMutedRef.current) { 
                sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob }));
              }
            };
          },
          onmessage: async (msg: any) => {
            if (msg.serverContent?.error) {
              console.error("AI Server Content Error:", msg.serverContent.error);
              showNotification(`AI processing error: ${msg.serverContent.error.message || 'An issue occurred during AI processing.'}`, 5000, true);
            }

            if (msg.serverContent?.inputTranscription) {
              setCurrentInputTranscription(prev => prev + msg.serverContent.inputTranscription.text);
              lastSentImageIdRef.current = null;
            }
            if (msg.serverContent?.outputTranscription) {
              setCurrentOutputTranscription(prev => prev + msg.serverContent.outputTranscription.text);

              if (lastSentImageIdRef.current) {
                setImageHistory(prev => {
                  const newHistory = [...prev];
                  const latestImageInteractionIndex = newHistory.findIndex(
                    (interaction) => interaction.id === lastSentImageIdRef.current
                  );
                  if (latestImageInteractionIndex !== -1) {
                    const currentInteraction = newHistory[latestImageInteractionIndex];
                    newHistory[latestImageInteractionIndex] = {
                      ...currentInteraction,
                      aiTextResponse: (currentInteraction.aiTextResponse || '') + msg.serverContent.outputTranscription.text,
                    };
                  }
                  return newHistory;
                });
              }
            }

            if (msg.serverContent?.turnComplete) {
              setCurrentInputTranscription('');
            }

            setNotification(null);

            if (msg.toolCall) {
              for (const fc of msg.toolCall.functionCalls) {
                if (fc.name === 'save_lead') {
                  const newLead: Lead = {
                    id: Math.random().toString(36).substring(2, 9),
                    ...fc.args,
                    timestamp: new Date()
                  };
                  onLeadCaptured?.(newLead);
                  showNotification(`Lead saved for ${newLead.name || newLead.phone}! Our manager will contact them shortly.`, 5000);

                  sessionPromise.then(s => s.sendToolResponse({
                    functionResponses: { id: fc.id, name: fc.name, response: { status: 'Lead saved successfully' } }
                  }));
                }
              }
            }
            
            const modelTurnParts = msg.serverContent?.modelTurn?.parts;
            if (modelTurnParts) {
              let audioFound = false;
              for (const part of modelTurnParts) {
                if (part.inlineData) {
                  const mimeType = part.inlineData.mimeType;
                  if (mimeType.startsWith('audio/')) {
                    const base64Audio = part.inlineData.data;
                    if (base64Audio) {
                      audioFound = true;
                      setStatus('Speaking');
                      nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
                      const buffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1);
                      const source = outputCtx.createBufferSource();
                      source.buffer = buffer;
                      source.connect(outputCtx.destination);
                      source.onended = () => { 
                        setStatus('Listening'); 
                        setCurrentOutputTranscription('');
                      };
                      source.start(nextStartTimeRef.current);
                      nextStartTimeRef.current += buffer.duration;
                    }
                  } else if (mimeType.startsWith('image/')) {
                    if (lastSentImageIdRef.current) {
                      setImageHistory(prev => {
                        const newHistory = [...prev];
                        const latestImageInteractionIndex = newHistory.findIndex(
                          (interaction) => interaction.id === lastSentImageIdRef.current
                        );
                        if (latestImageInteractionIndex !== -1) {
                          const currentInteraction = newHistory[latestImageInteractionIndex];
                          newHistory[latestImageInteractionIndex] = {
                            ...currentInteraction,
                            aiImageResponse: { data: part.inlineData.data, mimeType: mimeType },
                          };
                        }
                        return newHistory;
                      });
                    }
                  }
                }
              }
              if (!audioFound && msg.serverContent?.turnComplete) {
                 setStatus('Listening');
                 setCurrentOutputTranscription('');
              }
            } else if (msg.serverContent?.turnComplete) { 
              setStatus('Listening');
              setCurrentOutputTranscription('');
            }
          },
          onerror: (e: Event) => { // Changed type to Event for broader handling
            console.error("Live Session Error:", e);
            setStatus('Error');
            let errorMessage = "An unknown error occurred with the live session. Please try again.";

            if (e instanceof ErrorEvent) {
              errorMessage = `Live session error: ${e.message || 'Network issue.'} Please try again.`;
              if (e.message.includes("Requested entity was not found.")) { 
                errorMessage = "API Key error: The selected API key might be invalid or unauthorized for live services. Please ensure your API key is correctly configured and has access to Gemini Live. If this persists, verify your project's billing setup.";
              } else if (e.message.includes("WebSocket connection failed")) {
                errorMessage = "WebSocket connection failed. This could be a network issue or server unavailability. Please check your internet and try again.";
              }
            } else if (e instanceof CloseEvent) {
              errorMessage = `Live session disconnected. Code: ${e.code}, Reason: ${e.reason || 'Unknown'}. Please restart the call.`;
              if (e.code === 1006) { 
                  errorMessage = "Live session lost connection (network error). Please check your internet and try again.";
              } else if (e.code === 4000 || e.code === 4001) { // Common codes for protocol errors or invalid params
                  errorMessage = "Live session error: Invalid request or protocol issue. This might indicate an expired session or misconfigured parameters. Please try restarting.";
              }
            }
            showNotification(errorMessage, 0, true); // 0 duration means it stays until dismissed
            setTimeout(stopSession, 500); // Stop after a brief moment to show message
          },
          onclose: () => stopSession()
        }
      });
      sessionPromiseRef.current = sessionPromise;
    } catch (e: any) {
      console.error("Connection failed:", e);
      setStatus('Error');
      if (e.name === 'NotAllowedError') {
        showNotification("Microphone permission denied. Please enable it in your browser settings.", 0, true);
      } else if (e.name === 'NotFoundError') {
        showNotification("No microphone found. Please connect a microphone.", 0, true);
      } else if (e.name === 'AbortError') {
        showNotification("Microphone access was aborted by the user. Please try again.", 0, true);
      }
      else {
        showNotification("Failed to start session. Please check your internet connection or try again.", 0, true);
      }
    }
  };

  useEffect(() => {
    return () => {
      stopSession();
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
    };
  }, [stopSession]);


  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950 md:bg-slate-950/90 md:backdrop-blur-xl md:items-center md:justify-center p-0 md:p-4 animate-in fade-in duration-300">
      <div className="bg-slate-900 w-full md:max-w-md md:rounded-[40px] shadow-2xl flex flex-col h-full md:h-[700px] overflow-hidden relative">
        
        {/* Call UI Header */}
        <div className="pt-16 md:pt-10 px-8 flex flex-col items-center text-center">
          <div className="w-12 h-1 bg-white/20 rounded-full mb-8 md:hidden"></div>
          <div className="text-[10px] font-black tracking-[0.3em] text-indigo-400 uppercase mb-2">Amar Voice Live Agent</div>
          <h2 className="text-2xl font-black text-white">{config.shopName} Support</h2>
          <div className={`mt-4 px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${status === 'Speaking' ? 'bg-orange-500 text-white' : status === 'Listening' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
            <i className={`fa-solid ${status === 'Speaking' ? 'fa-wave-square' : status === 'Listening' ? 'fa-microphone' : 'fa-circle-dot'} mr-2 ${status === 'Listening' ? 'animate-pulse' : ''}`}></i>
            {status}
          </div>
        </div>

        {/* Visualizer Area */}
        <div className="flex-1 flex flex-col items-center justify-center p-10 gap-8">
          <div className={`relative w-48 h-48 rounded-full flex items-center justify-center transition-all duration-700 ${status === 'Speaking' ? 'bg-orange-500 scale-105 pulse-effect shadow-[0_0_60px_-15px_rgba(249,115,22,0.6)]' : status === 'Listening' ? 'bg-indigo-600 shadow-[0_0_60px_-15px_rgba(79,70,229,0.4)]' : 'bg-slate-800'}`}>
            <i className={`fa-solid ${status === 'Speaking' ? 'fa-volume-high' : 'fa-microphone'} text-5xl text-white`}></i>
            
            {/* Waveform rings (decorative) */}
            {status === 'Speaking' && (
              <div className="absolute inset-0 rounded-full border border-orange-400/30 animate-ping"></div>
            )}
            {status === 'Listening' && (
              <div className="absolute -inset-4 rounded-full border-2 border-indigo-500/20 animate-[spin_4s_linear_infinite]"></div>
            )}
          </div>

          <div className="text-center max-w-[240px] relative min-h-[48px] flex items-center justify-center">
            {notification ? (
              <p className={`text-sm font-black transition-all duration-300 ${status === 'Error' ? 'text-red-400' : 'text-indigo-400'}`}>
                {notification}
              </p>
            ) : (
              <p className="text-slate-400 text-sm font-medium leading-relaxed">
                {status === 'Idle' ? 'Tap below to start your real-time voice assistance.' : status === 'Listening' ? (isMuted ? 'Microphone is muted. Tap the mic icon to unmute.' : 'The AI is listening... Speak your query in Bengali.') : status === 'Speaking' ? 'The AI is providing details. Listen carefully.' : 'Connecting to Amar Voice infrastructure...'}
              </p>
            )}
          </div>

          {/* Image Interaction History Display */}
          {imageHistory.length > 0 && (
            <div 
              className="w-full max-w-sm max-h-48 overflow-y-auto bg-slate-800/60 p-4 rounded-xl text-xs text-white/80 hide-scrollbar mt-4 flex flex-col-reverse gap-4"
              aria-live="polite"
              aria-atomic="false"
              role="log"
            >
              {imageHistory.map((interaction) => (
                <div key={interaction.id} className="flex flex-col gap-2 p-2 bg-slate-700/50 rounded-lg">
                  <p className="font-bold text-slate-300 text-[10px]">{new Date(interaction.timestamp).toLocaleTimeString()}</p>
                  {interaction.userImage && (
                    <div className="relative border border-slate-600 rounded-md overflow-hidden">
                      <img 
                        src={`data:${interaction.userImage.mimeType};base64,${interaction.userImage.data}`} 
                        alt="User input image" 
                        className="w-full h-auto object-cover"
                      />
                      <span className="absolute top-1 right-1 bg-slate-900/70 text-white text-[8px] px-1 py-0.5 rounded-sm">You Sent</span>
                    </div>
                  )}
                  {interaction.aiTextResponse && (
                    <p className="text-slate-200">
                      <span className="font-bold text-indigo-300">AI: </span>
                      {interaction.aiTextResponse}
                    </p>
                  )}
                  {interaction.aiImageResponse && (
                    <div className="relative border border-indigo-500 rounded-md overflow-hidden">
                      <img 
                        src={`data:${interaction.aiImageResponse.mimeType};base64,${interaction.aiImageResponse.data}`} 
                        alt="AI Response image" 
                        className="w-full h-auto object-cover"
                      />
                      <span className="absolute top-1 right-1 bg-indigo-600/70 text-white text-[8px] px-1 py-0.5 rounded-sm">AI Response</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Transcription Display */}
          {(currentInputTranscription || currentOutputTranscription) && (
            <div 
              className="w-full max-w-sm max-h-24 overflow-y-auto bg-slate-800/60 p-4 rounded-xl text-xs text-white/80 hide-scrollbar mt-4"
              role="log"
              aria-live="polite"
              aria-atomic="false"
            >
              {currentInputTranscription && (
                <p className="mb-1">
                  <span className="font-bold text-slate-200">You: </span>
                  {currentInputTranscription}
                </p>
              )}
              {currentOutputTranscription && (
                <p>
                  <span className="font-bold text-indigo-300">AI: </span>
                  {currentOutputTranscription}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Interaction Controls */}
        <div className="p-8 pb-16 md:pb-10 bg-slate-800/50 flex flex-col gap-6 items-center border-t border-white/5">
          {isActive && (
            <div className="flex gap-6 mb-2">
              <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isSendingImage}
                className="w-16 h-16 rounded-full bg-white/10 text-white border border-white/10 hover:bg-white/20 active:scale-90 transition-all flex items-center justify-center shadow-lg"
                aria-label="Upload Image"
              >
                {isSendingImage ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-camera"></i>}
              </button>

              <button 
                onClick={toggleMute}
                className={`w-16 h-16 rounded-full ${isMuted ? 'bg-slate-700' : 'bg-indigo-600'} text-white border ${isMuted ? 'border-slate-600' : 'border-indigo-500'} hover:${isMuted ? 'bg-slate-600' : 'bg-indigo-700'} active:scale-90 transition-all flex items-center justify-center shadow-lg`}
                aria-label={isMuted ? "Unmute Microphone" : "Mute Microphone"}
              >
                <i className={`fa-solid ${isMuted ? 'fa-microphone-slash' : 'fa-microphone'} text-2xl`}></i>
              </button>
            </div>
          )}

          {isActive && (
            <div className="flex flex-col items-center gap-2 w-full max-w-xs mb-4">
              <label htmlFor="speech-rate-slider" className="text-white/70 text-xs font-semibold">AI Speech Speed: {speechRate.toFixed(2)}x</label>
              <input
                id="speech-rate-slider"
                type="range"
                min="0.5"
                max="2.0"
                step="0.25"
                value={speechRate}
                onChange={e => setSpeechRate(parseFloat(e.target.value))}
                className="w-full h-2 bg-indigo-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-indigo-300 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-indigo-300 [&::-moz-range-thumb]:rounded-full"
                aria-label="Adjust AI speech speed"
              />
            </div>
          )}

          {!isActive ? (
            <button 
              onClick={startSession} 
              className="w-full py-5 bg-indigo-600 text-white rounded-[24px] font-black text-lg shadow-xl hover:bg-indigo-700 active:scale-95 transition-all"
              aria-label="Start Live Call"
            >
              Start Live Call
            </button>
          ) : (
            <button 
              onClick={stopSession} 
              className="w-full py-5 bg-red-500 text-white rounded-[24px] font-black text-lg shadow-xl hover:bg-red-600 active:scale-95 transition-all"
              aria-label="End Call"
            >
              End Call
            </button>
          )}
          
          <button 
            onClick={() => { stopSession(); onClose(); }}
            className="text-white/40 text-xs font-bold hover:text-white transition-colors"
            aria-label="Cancel and Return to Dashboard"
          >
            Cancel and Return
          </button>
        </div>
      </div>
    </div>
  );
};

export default VoiceInterface;