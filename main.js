// Boot: load the chapter and Bible text, wire storage, the session gate and the service worker.
import { createApp } from './src/ui/app.js';
import { withDefaults, sessionGate } from './src/engine/parent.js';
import { loadProgress, saveProgress } from './src/engine/progress.js';
import { t } from './src/strings/strings.js';

const VERSION = '2.0.0';
const SETTINGS_KEY = 'arca-native-settings';
const TIME_KEY = 'arca-native-time';

const store = (() => { try { const s = globalThis.localStorage; s.getItem('x'); return s; } catch { return null; } })();
const readJSON = (k, d) => { try { return JSON.parse(store?.getItem(k)) ?? d; } catch { return d; } };
const writeJSON = (k, v) => { try { store?.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };

let settings = withDefaults(readJSON(SETTINGS_KEY, {}));
let progress = store ? loadProgress(store) : { v: 1, chapters: {}, history: [] };
let chaptersThisSession = 0;

const today = () => new Date().toISOString().slice(0, 10);
function minutesToday() {
  const rec = readJSON(TIME_KEY, null);
  return rec && rec.date === today() ? rec.ms / 60000 : 0;
}
function addTime(ms) {
  const rec = readJSON(TIME_KEY, null);
  const base = rec && rec.date === today() ? rec.ms : 0;
  writeJSON(TIME_KEY, { date: today(), ms: base + ms });
}
const gateNow = () => sessionGate(settings, { minutesToday: minutesToday(), chaptersThisSession }, new Date());

async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

async function boot() {
  document.documentElement.lang = settings.lang;
  const [ch, web, kjv, rvr] = await Promise.all([
    loadJSON('./src/content/ch01.json'),
    loadJSON('./src/bible/web-gen1-2.json'),
    loadJSON('./src/bible/kjv-gen1-2.json'),
    loadJSON('./src/bible/rvr1909-gen1-2.json'),
  ]);
  document.getElementById('loading').hidden = true;
  const app = createApp({
    canvas: document.getElementById('world'),
    sheetEl: document.getElementById('sheet'),
    hudEl: document.getElementById('hud'),
    toastEl: document.getElementById('toast'),
    ch,
    bibles: { WEB: web, KJV: kjv, RVR1909: rvr },
    getSettings: () => settings,
    setSettings: (s) => { settings = withDefaults(s); writeJSON(SETTINGS_KEY, settings); return settings; },
    getProgress: () => progress,
    setProgress: (p) => { progress = p; if (store) saveProgress(store, p); },
    gateNow,
    onChapterEnd: () => { chaptersThisSession++; },
  });

  // Count play time only while the page is visible; check the gate every 30 s.
  let lastTick = performance.now();
  setInterval(() => {
    const now = performance.now();
    if (document.visibilityState === 'visible') addTime(now - lastTick);
    lastTick = now;
    const g = gateNow();
    if (!g.allowed && g.reason !== 'chapters') app.applyGate(g);
  }, 30000);
  const g0 = gateNow();
  if (!g0.allowed && g0.reason !== 'chapters') app.applyGate(g0);
  addEventListener('pagehide', () => app.save());

  // Read-only adapter for tests and the comparison harness.
  globalThis.ARCA = Object.freeze({ version: VERSION, state: () => app.state(), on: (fn) => app.on(fn) });
}

boot().catch((e) => {
  const el = document.getElementById('loading');
  el.hidden = false;
  el.textContent = `${t('title')}: ${e.message}`;
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js', { type: 'module' }).catch(() => { /* offline install is optional */ });
}
