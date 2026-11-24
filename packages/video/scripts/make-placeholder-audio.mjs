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

// 15.5 s loop at 124 BPM: Punchy modern tech beat (kick, hi-hat, 808 sidechain bass, plucked arpeggio)
const BPM = 124;
const BEAT_DUR = 60 / BPM;
const LOOP_BEATS = 32;
const DURATION = LOOP_BEATS * BEAT_DUR;
const rootFreqs = [110, 87.31, 130.81, 98.00];
const chordNotes = [
  [220, 261.63, 329.63, 440],
  [174.61, 220, 261.63, 349.23],
  [261.63, 329.63, 392, 523.25],
  [196, 246.94, 293.66, 392],
];

save(
  'public/music/placeholder.wav',
  gen(DURATION, (t) => {
    const beat = t / BEAT_DUR;
    const progIdx = Math.min(3, Math.floor(beat / 8));
    let sample = 0;

    // 1. Kick Drum
    const beatFract = beat % 1;
    const kickTime = beatFract * BEAT_DUR;
    if (kickTime < 0.22) {
      const kickFreq = 48 + 120 * Math.exp(-kickTime * 28);
      const kickEnv = Math.exp(-kickTime * 18);
      sample += 0.38 * Math.sin(TAU * kickFreq * kickTime) * kickEnv;
    }

    // 2. Hi-Hat
    const sixteenth = (beat * 4) % 1;
    const hatTime = sixteenth * (BEAT_DUR / 4);
    if (hatTime < 0.05) {
      const isOffbeat = Math.floor(beat * 2) % 2 === 1;
      const hatVol = isOffbeat ? 0.09 : 0.045;
      const noise = Math.random() * 2 - 1;
      sample += noise * Math.exp(-hatTime * 95) * hatVol;
    }

    // 3. Synth Bass
    const bassFreq = rootFreqs[progIdx] / 2;
    const sidechain = Math.min(1, beatFract / 0.18);
    const bassEnv = (0.7 + 0.3 * Math.sin(TAU * 2 * beat)) * sidechain;
    const bassWave = Math.sin(TAU * bassFreq * t) + 0.35 * Math.sin(TAU * bassFreq * 2 * t);
    sample += 0.22 * bassWave * bassEnv;

    // 4. Plucked Synth Arpeggio
    const arpStep = Math.floor(beat * 4) % 4;
    const arpFreq = chordNotes[progIdx][arpStep];
    const arpTime = hatTime;
    const arpEnv = Math.exp(-arpTime * 14);
    const arpWave = Math.sin(TAU * arpFreq * t) + 0.25 * Math.sin(TAU * arpFreq * 2 * t);
    sample += 0.07 * arpWave * arpEnv;

    const loopFade = Math.min(1, t / 0.05, (DURATION - t) / 0.05);
    return sample * loopFade;
  }),
);
