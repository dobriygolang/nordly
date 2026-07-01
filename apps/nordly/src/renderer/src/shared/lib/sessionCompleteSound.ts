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
