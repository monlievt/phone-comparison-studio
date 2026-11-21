// Generates simple placeholder SFX and a looping music bed so the project renders out of the box.
// Replace the files in public/sfx and public/music with licensed assets (same file names).
import fs from 'node:fs';
import path from 'node:path';

const SR = 44100;
const TAU = Math.PI * 2;

const gen = (dur, fn) => {
  const n = Math.floor(dur * SR);
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = fn(i / SR, i / n);
  return a;
};

const wav = (samples) => {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.tanh(samples[i]);
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
};

const save = (file, samples) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, wav(samples));
  console.log('wrote', file);
};

const sweep = (dur, from, to, gain) => {
  let y = 0;
  return gen(dur, (t, p) => {
    const x = Math.random() * 2 - 1;
    y += (from + (to - from) * p) * (x - y);
    return y * Math.pow(Math.sin(Math.PI * p), 1.5) * gain;
  });
};

save('public/sfx/whoosh.wav', sweep(0.4, 0.03, 0.5, 2.5));
save('public/sfx/swoosh.wav', sweep(0.55, 0.02, 0.25, 2.5));
save('public/sfx/pop.wav', gen(0.12, (t, p) => Math.sin(TAU * (700 - 400 * p) * t) * Math.exp(-t * 30) * 0.8));
save('public/sfx/tick.wav', gen(0.05, (t) => Math.sin(TAU * 2200 * t) * Math.exp(-t * 90) * 0.7));
save(
  'public/sfx/ding.wav',
  gen(0.9, (t) => (Math.sin(TAU * 988 * t) + 0.5 * Math.sin(TAU * 1976 * t) + 0.25 * Math.sin(TAU * 2637 * t)) * Math.exp(-t * 5) * 0.35),
);

// 16 s loop: four soft chords, each fades in and out so the loop point is clean.
const chords = [
  [220, 261.63, 329.63],
  [174.61, 220, 261.63],
  [261.63, 329.63, 392],
  [196, 246.94, 293.66],
];
save(
  'public/music/placeholder.wav',
  gen(16, (t) => {
    const ci = Math.min(3, Math.floor(t / 4));
    const local = t - ci * 4;
    const env = Math.min(1, local / 0.6, (4 - local) / 0.6);
    const trem = 0.85 + 0.15 * Math.sin(TAU * 0.25 * t);
    const body = chords[ci].reduce((s, f) => s + Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 1.004 * t), 0);
    const bass = Math.sin(TAU * (chords[ci][0] / 2) * t);
    return (body * 0.07 + bass * 0.12) * env * trem;
  }),
);
