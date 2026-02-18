
// Helper function for base64 encoding, copied from audioUtils.ts for self-containment
function encode(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

class AudioRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096; // Same buffer size as ScriptProcessorNode
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const pcmDataFloat32 = input[0]; // Get the first channel of audio data

      // Convert Float32Array to Int16Array
      const l = pcmDataFloat32.length;
      const int16 = new Int16Array(l);
      for (let i = 0; i < l; i++) {
        int16[i] = pcmDataFloat32[i] * 32768; // Scale to Int16 range
      }

      // Encode and post message back to the main thread
      this.port.postMessage({
        data: encode(new Uint8Array(int16.buffer)),
        mimeType: 'audio/pcm;rate=16000',
      });
    }
    return true; // Keep the processor alive
  }
}

registerProcessor('audio-recorder-processor', AudioRecorderProcessor);
