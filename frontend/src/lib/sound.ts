let ctx: AudioContext | null = null;
let muted = readMuted();

function readMuted() {
  try {
    return localStorage.getItem("rps_muted") === "1";
  } catch {
    return false;
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem("rps_muted", value ? "1" : "0");
  } catch {
    // ignore
  }
}

function tone(frequency: number, duration: number, delay = 0) {
  if (muted) return;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    const start = ctx.currentTime + delay;
    gain.gain.setValueAtTime(0.06, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.start(start);
    oscillator.stop(start + duration);
  } catch {
    // Autoplay lock before the first user gesture — ignore.
  }
}

export function soundAssigned() {
  tone(523, 0.09);
  tone(784, 0.12, 0.08);
}

export function soundReveal() {
  tone(440, 0.08);
  tone(660, 0.12, 0.08);
}

export function soundWin() {
  tone(523, 0.1);
  tone(659, 0.1, 0.1);
  tone(784, 0.2, 0.2);
}

export function soundLose() {
  tone(392, 0.12);
  tone(294, 0.22, 0.12);
}
