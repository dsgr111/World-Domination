// ── Procedural Sound Engine ───────────────────────────────────────────────────
// Uses Web Audio API — no external dependencies

let ctx: AudioContext | null = null;
let muted = false;

export const setSoundMuted = (value: boolean) => {
  muted = value;
};

export const isSoundMuted = () => muted;

const getCtx = (): AudioContext | null => {
  if (muted) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") {
    ctx.resume();
  }
  return ctx;
};

const gain = (audioCtx: AudioContext, value: number) => {
  const g = audioCtx.createGain();
  g.gain.value = value;
  g.connect(audioCtx.destination);
  return g;
};

const osc = (
  audioCtx: AudioContext,
  type: OscillatorType,
  freq: number,
  dest: AudioNode
) => {
  const o = audioCtx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.connect(dest);
  return o;
};

// ── Explosion (nuclear attack) ────────────────────────────────────────────────
export const playExplosion = () => {
  const audioCtx = getCtx();
  if (!audioCtx) return;
  const t = audioCtx.currentTime;

  // Low boom
  const boomGain = gain(audioCtx, 0.5);
  boomGain.gain.setValueAtTime(0.5, t);
  boomGain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);

  const boom = osc(audioCtx, "sine", 60, boomGain);
  boom.frequency.setValueAtTime(80, t);
  boom.frequency.exponentialRampToValueAtTime(20, t + 1.5);
  boom.start(t);
  boom.stop(t + 1.5);

  // Noise burst
  const bufferSize = audioCtx.sampleRate * 0.8;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;

  const noiseGain = audioCtx.createGain();
  noiseGain.gain.setValueAtTime(0.3, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

  noise.connect(noiseGain);
  noiseGain.connect(audioCtx.destination);
  noise.start(t);
  noise.stop(t + 0.8);
};

// ── Coins (income received) ───────────────────────────────────────────────────
export const playCoins = () => {
  const audioCtx = getCtx();
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const freqs = [880, 1100, 1320, 1760];

  freqs.forEach((freq, i) => {
    const delay = i * 0.07;
    const g = gain(audioCtx, 0.15);
    g.gain.setValueAtTime(0.15, t + delay);
    g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.3);
    const o = osc(audioCtx, "sine", freq, g);
    o.start(t + delay);
    o.stop(t + delay + 0.3);
  });
};

// ── Timer tick ────────────────────────────────────────────────────────────────
export const playTick = () => {
  const audioCtx = getCtx();
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const g = gain(audioCtx, 0.08);
  g.gain.setValueAtTime(0.08, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  const o = osc(audioCtx, "square", 1200, g);
  o.start(t);
  o.stop(t + 0.05);
};

// ── Quiz correct ──────────────────────────────────────────────────────────────
export const playCorrect = () => {
  const audioCtx = getCtx();
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  [[523, 0], [659, 0.1], [784, 0.2]].forEach(([freq, delay]) => {
    const g = gain(audioCtx, 0.18);
    g.gain.setValueAtTime(0.18, t + delay);
    g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.25);
    const o = osc(audioCtx, "sine", freq as number, g);
    o.start(t + delay);
    o.stop(t + delay + 0.25);
  });
};

// ── Quiz wrong ────────────────────────────────────────────────────────────────
export const playWrong = () => {
  const audioCtx = getCtx();
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const g = gain(audioCtx, 0.2);
  g.gain.setValueAtTime(0.2, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  const o = osc(audioCtx, "sawtooth", 180, g);
  o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(80, t + 0.4);
  o.start(t);
  o.stop(t + 0.4);
};

// ── Round end fanfare ─────────────────────────────────────────────────────────
export const playRoundEnd = () => {
  const audioCtx = getCtx();
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  [[392, 0], [523, 0.12], [659, 0.24], [784, 0.36]].forEach(([freq, delay]) => {
    const g = gain(audioCtx, 0.2);
    g.gain.setValueAtTime(0.2, t + delay);
    g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.35);
    const o = osc(audioCtx, "triangle", freq as number, g);
    o.start(t + delay);
    o.stop(t + delay + 0.35);
  });
};

// ── Phase change ──────────────────────────────────────────────────────────────
export const playPhaseChange = () => {
  const audioCtx = getCtx();
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const g = gain(audioCtx, 0.15);
  g.gain.setValueAtTime(0.15, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  const o = osc(audioCtx, "sine", 440, g);
  o.frequency.setValueAtTime(440, t);
  o.frequency.setValueAtTime(550, t + 0.15);
  o.start(t);
  o.stop(t + 0.5);
};

// ── City destroyed ────────────────────────────────────────────────────────────
export const playCityDestroyed = () => {
  const audioCtx = getCtx();
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const g = gain(audioCtx, 0.35);
  g.gain.setValueAtTime(0.35, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
  const o = osc(audioCtx, "sawtooth", 220, g);
  o.frequency.exponentialRampToValueAtTime(40, t + 1.2);
  o.start(t);
  o.stop(t + 1.2);
};

// ── Vote / button ─────────────────────────────────────────────────────────────
export const playVote = () => {
  const audioCtx = getCtx();
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const g = gain(audioCtx, 0.1);
  g.gain.setValueAtTime(0.1, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  const o = osc(audioCtx, "sine", 660, g);
  o.start(t);
  o.stop(t + 0.15);
};
