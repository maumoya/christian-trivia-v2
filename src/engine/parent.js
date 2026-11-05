// Parent settings, the session gate and the adult gate.
export const DEFAULTS = Object.freeze({
  minutesPerDay: 30, chaptersPerSession: 1, quietStart: '20:00', quietEnd: '07:00',
  translation: 'WEB', lang: 'en', voiceRate: 1.0, captions: true,
});

export function withDefaults(s = {}) {
  const out = { ...DEFAULTS, ...s };
  if (!s.translation && out.lang === 'es') out.translation = 'RVR1909';
  return out;
}

const minutesOf = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };

export function inQuiet(settings, now) {
  const t = now.getHours() * 60 + now.getMinutes();
  const a = minutesOf(settings.quietStart);
  const b = minutesOf(settings.quietEnd);
  if (a === b) return false;
  return a < b ? t >= a && t < b : t >= a || t < b;
}

export function sessionGate(settings, { minutesToday = 0, chaptersThisSession = 0 } = {}, now = new Date()) {
  const s = withDefaults(settings);
  if (inQuiet(s, now)) return { allowed: false, reason: 'quiet', endAfterScene: true };
  if (minutesToday >= s.minutesPerDay) return { allowed: false, reason: 'time', endAfterScene: true };
  if (chaptersThisSession >= s.chaptersPerSession) return { allowed: false, reason: 'chapters', endAfterScene: true };
  return { allowed: true, endAfterScene: false };
}

export function makeAdultChallenge(rng = Math.random) {
  const a = 10 + Math.floor(rng() * 90);
  const b = 2 + Math.floor(rng() * 8);
  return { a, b, answer: a * b, text: `${a} × ${b}` };
}

export function checkAdultGate(challenge, holdMs, input) {
  return holdMs >= 3000 && Number(String(input).trim()) === challenge.answer;
}
