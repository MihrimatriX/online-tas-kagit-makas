let ctx: AudioContext | null = null;

function audio() {
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(frequency: number, duration: number, delay = 0) {
  try {
    const ac = audio();
    const oscillator = ac.createOscillator();
    const gain = ac.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    gain.connect(ac.destination);
    const start = ac.currentTime + delay;
    gain.gain.setValueAtTime(0.04, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.start(start);
    oscillator.stop(start + duration);
  } catch {
    // autoplay lock — ignore
  }
}

export function soundAssigned() {
  tone(523, 0.09);
  tone(784, 0.12, 0.08);
}

export function soundReveal() {
  tone(440, 0.1);
  tone(660, 0.14, 0.1);
}

export function soundWin() {
  tone(523, 0.1);
  tone(659, 0.1, 0.1);
  tone(784, 0.18, 0.2);
}
