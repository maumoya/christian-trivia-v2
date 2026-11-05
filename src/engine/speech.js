// Read-aloud with speechSynthesis. Captions always show, so a missing voice never blocks play.
export function createSpeaker(synth, { lang = 'en', rate = 1.0, Utterance = globalThis.SpeechSynthesisUtterance } = {}) {
  const available = Boolean(synth && typeof synth.speak === 'function' && typeof Utterance === 'function');
  const pickVoice = () => (synth?.getVoices?.() || []).find((v) => v.lang?.toLowerCase().startsWith(lang));
  return {
    available,
    say(text) {
      if (!available) return Promise.resolve('unavailable');
      return new Promise((resolve) => {
        try {
          synth.cancel();
          const u = new Utterance(text);
          u.lang = lang === 'es' ? 'es-ES' : 'en-US';
          u.rate = rate;
          const v = pickVoice();
          if (v) u.voice = v;
          u.onend = () => resolve('spoken');
          u.onerror = () => resolve('unavailable');
          synth.speak(u);
        } catch {
          resolve('unavailable');
        }
      });
    },
    stop() { try { synth?.cancel(); } catch { /* no voice */ } },
  };
}
