// Soft three-note chime when a focus session completes (Web Audio API — no asset files).

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    audioCtx = new Ctx();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.82;
    masterGain.connect(audioCtx.destination);
  }
  return audioCtx;
}

function playTone(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  startAt: number,
  durationSec: number,
  peakGain: number,
): void {
  const osc = ctx.createOscillator();
  const warm = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = frequency;
  warm.type = 'triangle';
  warm.frequency.value = frequency * 2;
  warm.detune.value = 5;

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec);

  osc.connect(gain);
  warm.connect(gain);
  gain.connect(destination);

  osc.start(startAt);
  warm.start(startAt);
  osc.stop(startAt + durationSec + 0.05);
  warm.stop(startAt + durationSec + 0.05);
}

function playMalletTone(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  startAt: number,
  durationSec: number,
  peakGain: number,
): void {
  const fundamental = ctx.createOscillator();
  const overtone = ctx.createOscillator();
  const click = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  fundamental.type = 'sine';
  fundamental.frequency.value = frequency;
  overtone.type = 'triangle';
  overtone.frequency.value = frequency * 2.01;
  overtone.detune.value = -7;
  click.type = 'sine';
  click.frequency.value = frequency * 4.02;

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2200, startAt);
  filter.frequency.exponentialRampToValueAtTime(900, startAt + durationSec);
  filter.Q.value = 0.55;

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(peakGain * 0.22, startAt + 0.09);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec);

  fundamental.connect(gain);
  overtone.connect(gain);
  click.connect(gain);
  gain.connect(filter);
  filter.connect(destination);

  fundamental.start(startAt);
  overtone.start(startAt);
  click.start(startAt);
  fundamental.stop(startAt + durationSec + 0.04);
  overtone.stop(startAt + durationSec + 0.04);
  click.stop(startAt + 0.055);
}

/** Pleasant ascending chime — G4 → B4 → D5 with soft decay. */
export async function playSessionCompleteSound(): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;

  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }

  const t0 = ctx.currentTime + 0.02;
  const notes = [392.0, 493.88, 587.33];
  const stagger = 0.12;
  const noteLen = 0.85;

  for (let i = 0; i < notes.length; i++) {
    playTone(ctx, masterGain, notes[i], t0 + i * stagger, noteLen, 0.1 - i * 0.012);
  }

  playTone(ctx, masterGain, 783.99, t0 + 0.38, 0.55, 0.035);
}

/** Warm calendar nudge — short marimba-like C major arpeggio, softer than completion. */
export async function playCalendarReminderSound(): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx || !masterGain) return;

  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }

  const t0 = ctx.currentTime + 0.02;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  const gains = [0.075, 0.06, 0.052, 0.034];

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    if (!note) continue;
    playMalletTone(ctx, masterGain, note, t0 + i * 0.085, 0.58 - i * 0.035, gains[i] ?? 0.04);
  }
}
