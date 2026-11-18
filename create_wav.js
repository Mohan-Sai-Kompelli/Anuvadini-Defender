const fs = require('fs');

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

const sampleRate = 44100;
const duration = 0.5; // seconds
const numSamples = sampleRate * duration;
const buffer = new ArrayBuffer(44 + numSamples * 2);
const view = new DataView(buffer);

/* RIFF identifier */
writeString(view, 0, 'RIFF');
/* RIFF chunk length */
view.setUint32(4, 36 + numSamples * 2, true);
/* RIFF type */
writeString(view, 8, 'WAVE');
/* format chunk identifier */
writeString(view, 12, 'fmt ');
/* format chunk length */
view.setUint32(16, 16, true);
/* sample format (raw) */
view.setUint16(20, 1, true);
/* channel count */
view.setUint16(22, 1, true);
/* sample rate */
view.setUint32(24, sampleRate, true);
/* byte rate (sample rate * block align) */
view.setUint32(28, sampleRate * 2, true);
/* block align (channel count * bytes per sample) */
view.setUint16(32, 2, true);
/* bits per sample */
view.setUint16(34, 16, true);
/* data chunk identifier */
writeString(view, 36, 'data');
/* data chunk length */
view.setUint32(40, numSamples * 2, true);

// Generate a nice enterprise bell sound
// Frequency envelope (exponential decay)
let offset = 44;
for (let i = 0; i < numSamples; i++) {
  const t = i / sampleRate;
  
  // Mix of frequencies for a "bell" or "chime"
  const f1 = Math.sin(2 * Math.PI * 880 * t); // A5
  const f2 = Math.sin(2 * Math.PI * 1760 * t); // A6
  const f3 = Math.sin(2 * Math.PI * 2640 * t); // E7
  
  // Envelope
  const env = Math.exp(-t * 8); 
  
  let sample = (f1 * 0.5 + f2 * 0.3 + f3 * 0.2) * env;
  
  // Apply a slight fade out at the very end to avoid clicking
  if (i > numSamples - 4410) {
    sample *= (numSamples - i) / 4410;
  }

  sample = Math.max(-1, Math.min(1, sample));
  view.setInt16(offset, sample * 32767, true);
  offset += 2;
}

fs.writeFileSync('android/app/src/main/res/raw/enterprise_notify.wav', Buffer.from(buffer));
console.log('enterprise_notify.wav generated');
