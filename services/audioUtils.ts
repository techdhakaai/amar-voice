
export function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export function createBlob(data: Float32Array): { data: string; mimeType: string } {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

/**
 * Plays a synthesized tone for UI feedback.
 * @param ctx AudioContext to play on
 * @param freq Frequency in Hz
 * @param duration Duration in seconds
 * @param type Oscillator type
 */
export function playTone(ctx: AudioContext, freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.1) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

/**
 * Exports an AudioBuffer to a WAV Blob.
 * @param audioBuffer The AudioBuffer to export.
 * @returns A Promise that resolves with a Blob containing the WAV audio.
 */
export async function exportWav(audioBuffer: AudioBuffer): Promise<Blob> {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16; // 16-bit PCM

  const buffer = new ArrayBuffer(44 + audioBuffer.length * numberOfChannels * (bitDepth / 8));
  const view = new DataView(buffer);

  let offset = 0;
  const writeString = (str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
    offset += str.length;
  };
  const writeUint32 = (val: number) => {
    view.setUint32(offset, val, true);
    offset += 4;
  };
  const writeUint16 = (val: number) => {
    view.setUint16(offset, val, true);
    offset += 2;
  };

  // RIFF chunk
  writeString('RIFF');
  writeUint32(36 + audioBuffer.length * numberOfChannels * (bitDepth / 8)); // ChunkSize
  writeString('WAVE');

  // FMT chunk
  writeString('fmt ');
  writeUint32(16); // Subchunk1Size
  writeUint16(format); // AudioFormat (1 = PCM)
  writeUint16(numberOfChannels); // NumChannels
  writeUint32(sampleRate); // SampleRate
  writeUint32(sampleRate * numberOfChannels * (bitDepth / 8)); // ByteRate
  writeUint16(numberOfChannels * (bitDepth / 8)); // BlockAlign
  writeUint16(bitDepth); // BitsPerSample

  // DATA chunk
  writeString('data');
  writeUint32(audioBuffer.length * numberOfChannels * (bitDepth / 8)); // Subchunk2Size

  const float32Data = new Float32Array(audioBuffer.length * numberOfChannels);
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const channelData = audioBuffer.getChannelData(channel);
    for (let i = 0; i < audioBuffer.length; i++) {
      float32Data[i * numberOfChannels + channel] = channelData[i];
    }
  }

  // Write PCM data
  for (let i = 0; i < float32Data.length; i++) {
    let s = Math.max(-1, Math.min(1, float32Data[i]));
    s = s < 0 ? s * 0x8000 : s * 0x7FFF;
    view.setInt16(offset, s, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}
