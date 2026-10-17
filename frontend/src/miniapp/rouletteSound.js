const SETTING_KEY = 'miniappRouletteSound';

export function readRouletteSoundEnabled() {
  try { return localStorage.getItem(SETTING_KEY) !== 'off'; }
  catch (_) { return true; }
}

export function saveRouletteSoundEnabled(enabled) {
  try { localStorage.setItem(SETTING_KEY, enabled ? 'on' : 'off'); }
  catch (_) { /* Sound still works when WebView storage is unavailable. */ }
}

// Local, quiet synthesis: no media downloads, microphone, or autoplay. Audio is
// decoration and must never reject or delay a penalty operation.
export function createRouletteSound(initiallyEnabled = true) {
  let enabled = initiallyEnabled;
  let context = null;
  const voices = new Set();

  const stop = () => {
    voices.forEach((voice) => {
      try { voice.oscillator.stop(); } catch (_) { /* Already ended. */ }
      try { voice.oscillator.disconnect(); voice.gain.disconnect(); } catch (_) { /* Already disconnected. */ }
    });
    voices.clear();
  };

  // Call synchronously from a user click, before awaiting the server (iOS).
  const prepare = () => {
    if (!enabled || document.visibilityState === 'hidden') return;
    try {
      if (!context || context.state === 'closed') {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        context = new AudioContext();
      }
      if (context.state !== 'running') Promise.resolve(context.resume()).catch(() => {});
    } catch (_) { /* Unsupported or blocked audio is a silent fallback. */ }
  };

  const tone = (frequency, duration, volume, delay = 0, type = 'sine', endFrequency = frequency) => {
    if (!enabled || !context || context.state !== 'running' || document.visibilityState === 'hidden') return;
    let voice;
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      voice = { oscillator, gain };
      const start = context.currentTime + delay;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => {
        voices.delete(voice);
        try { oscillator.disconnect(); gain.disconnect(); } catch (_) { /* Context already released. */ }
      };
      voices.add(voice);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.01);
    } catch (_) {
      if (voice) {
        voices.delete(voice);
        try { voice.oscillator.stop(); voice.oscillator.disconnect(); voice.gain.disconnect(); } catch (_) { /* Optional audio. */ }
      }
    }
  };

  return {
    prepare,
    tick: () => tone(1400, 0.022, 0.025, 0, 'triangle', 700),
    result: () => {
      stop();
      tone(660, 0.13, 0.035);
      tone(880, 0.16, 0.035, 0.09);
    },
    stop,
    setEnabled: (value) => { enabled = value; if (!enabled) stop(); },
    dispose: () => {
      stop();
      const previous = context;
      context = null;
      try { if (previous && previous.state !== 'closed') Promise.resolve(previous.close()).catch(() => {}); }
      catch (_) { /* A closing WebView may have released the context already. */ }
    },
  };
}
