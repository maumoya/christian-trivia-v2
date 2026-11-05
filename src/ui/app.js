// The playable app: overworld, sheets, books, co-op, parent tools. Drives the pure engine.
import { createGame } from '../engine/game.js';
import { computeStars } from '../engine/rewards.js';
import { scheduleReview } from '../engine/review.js';
import { makeAdultChallenge, checkAdultGate } from '../engine/parent.js';
import { encodeProgress, decodeProgress, mergeProgress } from '../engine/progress.js';
import { createSpeaker } from '../engine/speech.js';
import { t as tr } from '../strings/strings.js';
import { buildWorld, passable, tileAt, TILE, AREA_W } from './world.js';
import { drawWorld } from './render.js';
import { pic } from './pics.js';

const SPEED = 66; // px per second in world units
const COOP_MIN = 600;

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}

export function canCoop(w, h2) { return Math.min(w, h2) >= COOP_MIN; }

export function createApp(env) {
  const { canvas, sheetEl, hudEl, toastEl, ch, bibles } = env;
  const ctx = canvas.getContext('2d');
  const world = buildWorld(ch);
  const listeners = new Set();
  let settings = env.getSettings();
  let speaker = null;
  let voiceOn = true;
  let game = null;
  let pendingHistory = [];
  let pendingStop = false;
  let modal = null; // 'stopAsk' | 'book' | 'adult' | 'settings' | 'review'
  let bookTab = 'cards';
  let lastHint = null;
  let lastRef = null;
  let stopReason = null;
  let adult = null;
  let review = null;
  let coop = false;
  let rendered = '';
  let lastGateToast = 0;
  const keys = new Set();
  const pointers = new Map();
  const p1 = { x: 0, y: 0, tunic: '#c8553d', step: 0, target: null, onSpot: null, stick: null };
  const p2 = { x: 0, y: 0, tunic: '#3a6ea5', step: 0, target: null, onSpot: null, stick: null };
  const pal = { x: 0, y: 0, trail: [] };

  const L = (k) => tr(k, settings.lang);
  const txt = (o) => (o ? o[settings.lang] ?? o.en ?? '' : '');
  const scene = (id) => ch.scenes.find((s) => s.id === id);
  const questById = (id) => ch.scenes.flatMap((s) => s.quests).find((q) => q.id === id);
  const questionById = (id) => ch.scenes.flatMap((s) => s.quests).map((q) => q.question).find((q) => q?.id === id);
  const bible = () => bibles[settings.translation] || bibles.WEB;

  function versesFor(ref) {
    const v = bible().verses;
    if (v[ref]) return [[ref, v[ref]]];
    const m = /^Gen (\d+):(\d+)[–-](\d+)$/.exec(ref || '');
    if (!m) return [];
    const out = [];
    for (let i = Number(m[2]); i <= Number(m[3]); i++) { const r = `Gen ${m[1]}:${i}`; if (v[r]) out.push([r, v[r]]); }
    return out;
  }

  function makeSpeaker() {
    speaker = createSpeaker(globalThis.speechSynthesis, { lang: settings.lang, rate: settings.voiceRate });
  }
  const say = (text) => { if (voiceOn && speaker?.available) speaker.say(text); };

  // ---------- game life ----------
  function emit(e) { env.onEvent?.(e); for (const fn of listeners) { try { fn(e); } catch { /* listener error stays local */ } } }

  function onEvent(e) {
    emit(e);
    switch (e.type) {
      case 'answered':
        if (e.right) pendingHistory.push({ questionId: e.questionId, at: new Date().toISOString(), firstTry: e.firstTry });
        break;
      case 'card': toast(`${pic('card')} ${L('newCard')}: ${txt(scene(e.id)?.card)}`); break;
      case 'badge': toast(`${pic(e.id)} ${L('newBadge')}: ${txt(ch.badges.find((b) => b.id === e.id)?.title)}`); break;
      case 'companion': toast(`${pic(e.id)} ${L('newFriend')}: ${txt(ch.companions.find((c) => c.id === e.id)?.name)}`); pal.x = p1.x; pal.y = p1.y; break;
      case 'stop-point': pendingStop = true; break;
      case 'chapter-end': env.onChapterEnd?.(); break;
      default: break;
    }
    if (['quest-done', 'chapter-end', 'badge'].includes(e.type)) queueMicrotask(save);
  }

  function savedChapter() { return env.getProgress().chapters?.[ch.id] || {}; }

  function save(extra = {}) {
    if (!game) return;
    const s = game.state();
    const snap = {
      questsDone: s.questsDone, itemsFound: s.itemsFound, piecesFound: s.piecesFound,
      firstTryRight: s.firstTryRight, badges: s.badges, cards: s.cards, path: s.path, ...extra,
    };
    if (s.phase === 'chapter-end') snap.stars = computeStars(s, ch, { tryTodayDone: Boolean(savedChapter().tryTodayDone || extra.tryTodayDone) });
    const next = mergeProgress(env.getProgress(), { v: 1, chapters: { [ch.id]: snap }, history: pendingHistory });
    pendingHistory = [];
    env.setProgress(next);
  }

  function placeAt(areaIndex) {
    const tx = areaIndex === 0 ? world.start.tx : areaIndex * AREA_W + 2;
    p1.x = tx * TILE + 8; p1.y = world.start.ty * TILE + 4;
    p2.x = p1.x + 12; p2.y = p1.y + 12;
    pal.x = p1.x - 12; pal.y = p1.y; pal.trail = [];
    p1.onSpot = p2.onSpot = null; p1.target = p2.target = null;
  }

  function newGame(restoreSaved) {
    game = createGame(ch, { lang: settings.lang, onEvent });
    const saved = savedChapter();
    if (restoreSaved && saved.questsDone?.length) game.restore(saved);
    const open = world.scenes.map((s, i) => (game.isUnlocked(s.id) ? i : 0));
    placeAt(Math.max(...open));
    pendingStop = false; lastHint = null; lastRef = null; stopReason = null;
    rendered = '';
  }

  function startReview() {
    const hist = env.getProgress().history || [];
    if (!hist.length) return;
    const ids = scheduleReview(hist, ch.end.reviewSeeds, new Date()).filter((id) => questionById(id));
    if (ids.length) { review = { ids, i: 0, tries: 0, hint: null }; modal = 'review'; }
  }

  // ---------- toasts ----------
  const toastQ = [];
  let toastBusy = false;
  function toast(msg) {
    toastQ.push(msg);
    if (!toastBusy) nextToast();
  }
  function nextToast() {
    const m = toastQ.shift();
    if (!m) { toastBusy = false; toastEl.hidden = true; return; }
    toastBusy = true;
    toastEl.textContent = m;
    toastEl.hidden = false;
    setTimeout(nextToast, 2400);
  }

  // ---------- sheets ----------
  function picButton(key, label, onclick, extra = '') {
    return h('button', { class: `pick ${extra}`, type: 'button', onclick },
      h('span', { class: 'pic', 'aria-hidden': 'true' }, pic(key)), h('span', { class: 'lbl' }, label));
  }
  const btn = (label, onclick, cls = '') => h('button', { type: 'button', class: `btn ${cls}`, onclick }, label);
  const versesBlock = (refs) => {
    const list = refs.flatMap(versesFor);
    if (!list.length) return null;
    return h('details', { class: 'verses' }, h('summary', {}, `${L('readVerses')} (${bible().translation || settings.translation})`),
      ...list.map(([r, v]) => h('p', {}, h('b', {}, `${r} `), v)));
  };

  function sheet(kind, ...kids) {
    return h('div', { class: `sheet ${kind}`, role: 'dialog', 'aria-modal': 'true' }, ...kids);
  }

  function momentSheet(st) {
    const sc = scene(st.sceneId);
    return sheet('moment',
      h('div', { class: 'light', 'aria-hidden': 'true' }),
      h('h2', {}, txt(sc.card)),
      lastHint ? h('p', { class: 'hint' }, `💡 ${lastHint}`) : null,
      h('p', { class: 'caption', 'aria-live': 'polite' }, txt(sc.narration)),
      versesBlock(sc.refs),
      h('div', { class: 'row' },
        btn(`🔊 ${L('listen')}`, () => say(txt(sc.narration)), 'soft'),
        btn(`${L('continue')} ➜`, () => { game.momentDone(); refresh(); }, 'go')));
  }

  function questionSheet(st) {
    const q = questById(st.questId).question;
    return sheet('question',
      h('p', { class: 'prompt' }, txt(q.prompt)),
      lastHint ? h('p', { class: 'hint' }, `💡 ${lastHint}`) : null,
      h('div', { class: 'picks' }, q.answers.map((a) => picButton(a.pic, txt(a.label), () => onAnswer(a.id)))),
      h('div', { class: 'row' },
        btn(`🔊 ${L('listen')}`, () => { game.replay('question'); say(promptSpeech(q)); }, 'soft'),
        btn(`↺ ${L('replayMoment')}`, () => { game.replay('moment'); refresh(); }, 'soft')));
  }

  const promptSpeech = (q) => `${txt(q.prompt)} ${q.answers.map((a) => txt(a.label)).join(', ')}`;

  function onAnswer(id) {
    const r = game.answer(id);
    if (r.right) { lastHint = null; lastRef = null; say(L('yes')); }
    else if (r.hint) { lastHint = r.hint; say(r.hint); }
    refresh(true);
  }

  function chooseSheet(st) {
    const q = questById(st.questId);
    return sheet('question',
      h('p', { class: 'prompt' }, txt(q.prompt)),
      h('div', { class: 'picks two' }, q.options.map((o) => picButton(o.pic, txt(o.label), () => {
        const r = game.choose(o.id);
        if (r.accepted) { lastHint = null; lastRef = r.ref; say(L('yes')); } else { lastHint = r.hint; say(r.hint); }
        refresh(true);
      }))),
      h('div', { class: 'row' }, btn(`🔊 ${L('listen')}`, () => say(`${txt(q.prompt)} ${q.options.map((o) => txt(o.label)).join(', ')}`), 'soft')));
  }

  function feedbackSheet() {
    return sheet('feedback',
      h('div', { class: 'light', 'aria-hidden': 'true' }),
      h('p', { class: 'big' }, `✨ ${L('yes')}`),
      lastRef ? versesBlock([lastRef]) : null,
      h('div', { class: 'row' }, btn(`${L('next')} ➜`, () => {
        game.next();
        lastRef = null;
        const after = game.state();
        const last = ch.scenes[ch.scenes.length - 1];
        const left = ch.scenes.flatMap((s) => s.quests).filter((q) => !after.questsDone.includes(q.id));
        if (after.phase === 'explore' && left.length && last.quests.every((q) => after.questsDone.includes(q.id))) {
          const sc = ch.scenes.find((s) => s.quests.includes(left[0]));
          toast(`🔎 ${L('oneMore')}: ${txt(left[0].hint) || txt(sc?.card)}`);
        }
        if (pendingStop && after.phase === 'explore') { pendingStop = false; modal = 'stopAsk'; }
        pendingStop = false;
        refresh(true);
      }, 'go')));
  }

  function findBanner(st) {
    const q = questById(st.questId);
    const got = game.foundSoFar(q.id);
    return h('div', { class: 'banner', role: 'status' },
      h('span', {}, L('findThese')),
      ...q.items.map((id) => h('span', { class: got.includes(id) ? 'got' : 'need' }, got.includes(id) ? `✔${pic(id)}` : pic(id))),
      btn(`🔊 ${L('listen')}`, () => say(txt(q.hint)), 'soft'),
      btn(L('walkAway'), () => { game.cancel(); refresh(true); }, 'soft'));
  }

  function stoppedSheet() {
    const msg = stopReason === 'quiet' ? L('stoppedQuiet') : stopReason === 'time' ? L('stoppedTime') : L('stopped');
    return sheet('stopped',
      h('p', { class: 'big' }, '🌙'), h('p', { class: 'caption' }, msg),
      h('div', { class: 'row' },
        btn(L('resume'), () => {
          const g = env.gateNow();
          if (!g.allowed && g.reason !== 'chapters') { stopReason = g.reason; refresh(true); return; }
          stopReason = null; game.resume(); refresh(true);
        }, 'go'),
        btn(`⚙ ${L('grownUps')}`, () => openAdult(() => { modal = 'settings'; }), 'soft')));
  }

  function endSheet(st) {
    const tryDone = Boolean(savedChapter().tryTodayDone);
    const stars = computeStars(st, ch, { tryTodayDone: tryDone });
    const mv = versesFor(ch.memoryVerse.ref)[0];
    return sheet('end',
      h('div', { class: 'light', 'aria-hidden': 'true' }),
      h('h2', {}, L('endTitle')),
      h('p', { class: 'stars', 'aria-label': `${stars} / 5 ${L('stars')}` }, '★'.repeat(stars) + '☆'.repeat(5 - stars)),
      mv ? h('p', { class: 'memory' }, h('b', {}, `${L('memory')}: `), `“${mv[1]}” `, h('i', {}, mv[0])) : null,
      h('div', { class: 'try' }, h('b', {}, `${L('tryToday')}: `), txt(ch.end.tryToday),
        tryDone ? h('span', { class: 'done' }, ' ✔') : btn(L('weDidIt'), () => openAdult(() => { save({ tryTodayDone: true }); modal = null; }), 'soft')),
      h('div', { class: 'row' },
        btn(`📖 ${L('cards')}`, () => { modal = 'book'; bookTab = 'cards'; refresh(true); }, 'soft'),
        btn(`↺ ${L('playAgain')}`, () => {
          save(); newGame(false);
          const g = env.gateNow();
          if (!g.allowed) { stopReason = g.reason; game.endAfterScene(); }
          refresh(true);
        }, 'go')));
  }

  function stopAskSheet() {
    return sheet('stopask', h('p', { class: 'caption' }, L('stopAsk')),
      h('div', { class: 'row' },
        btn(`🌙 ${L('stopHere')}`, () => { modal = null; stopReason = 'choice'; game.endAfterScene(); save(); refresh(true); }, 'soft'),
        btn(`${L('keepExploring')} ➜`, () => { modal = null; refresh(true); }, 'go')));
  }

  function bookSheet(st) {
    const tabs = ['cards', 'badges', 'friends', 'path'];
    let body;
    if (bookTab === 'cards') {
      body = st.cards.length ? st.cards.map((id) => { const sc = scene(id); return h('div', { class: 'card' }, h('b', {}, txt(sc.card)), versesBlock(sc.refs)); }) : [h('p', {}, L('empty'))];
    } else if (bookTab === 'badges') {
      body = st.badges.length ? st.badges.map((id) => { const b = ch.badges.find((x) => x.id === id); return h('div', { class: 'card' }, `${pic(id)} `, h('b', {}, txt(b.title)), ` · ${b.ref}`); }) : [h('p', {}, L('empty'))];
    } else if (bookTab === 'friends') {
      body = [
        h('p', {}, ...st.companions.map((id) => `${pic(id)} ${txt(ch.companions.find((c) => c.id === id)?.name)}  `)),
        h('p', { class: 'grid' }, ...ch.storyItems.map((id) => h('span', { class: st.itemsFound.includes(id) ? 'got' : 'need' }, st.itemsFound.includes(id) ? pic(id) : '?'))),
        h('p', {}, `${pic('piece')} ${st.piecesFound.length} / ${ch.versePieces.length}`),
      ];
    } else {
      const total = world.scenes.length + world.spots.length;
      body = [h('p', { class: 'pathbar' }, '👣'.repeat(Math.min(st.path, total)), h('span', { class: 'need' }, '·'.repeat(Math.max(0, total - st.path)))),
        h('p', {}, `${st.path} / ${total}`)];
    }
    return sheet('book',
      h('div', { class: 'tabs', role: 'tablist' }, tabs.map((k) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(k === bookTab), class: k === bookTab ? 'tab on' : 'tab', onclick: () => { bookTab = k; refresh(true); } }, L(k)))),
      h('div', { class: 'bookbody' }, body),
      h('div', { class: 'row' }, btn(L('close'), () => { modal = null; refresh(true); }, 'go')));
  }

  function openAdult(onPass) {
    adult = { c: makeAdultChallenge(), holdStart: 0, holdMs: 0, onPass, msg: '', prev: modal };
    modal = 'adult';
    refresh(true);
  }

  function adultSheet() {
    const hold = h('button', { type: 'button', class: `btn hold ${adult.holdMs >= 3000 ? 'held' : ''}` }, adult.holdMs >= 3000 ? '✔' : L('hold'));
    hold.addEventListener('pointerdown', () => { adult.holdStart = performance.now(); hold.classList.add('pressing'); });
    const end = () => { if (adult.holdStart) { adult.holdMs = Math.max(adult.holdMs, performance.now() - adult.holdStart); adult.holdStart = 0; refresh(true); } };
    hold.addEventListener('pointerup', end);
    hold.addEventListener('pointerleave', end);
    const input = h('input', { id: 'adult-answer', type: 'text', inputmode: 'numeric', autocomplete: 'off', 'aria-label': adult.c.text });
    return sheet('adult',
      h('h2', {}, `⚙ ${L('grownUps')}`), h('p', { class: 'small' }, L('adultHold')),
      h('div', { class: 'row' }, hold, h('span', { class: 'math' }, `${adult.c.text} =`), input),
      adult.msg ? h('p', { class: 'hint' }, adult.msg) : null,
      h('div', { class: 'row' },
        btn(L('close'), () => { modal = adult.prev === 'adult' ? null : adult.prev; adult = null; refresh(true); }, 'soft'),
        btn(L('check'), () => {
          if (checkAdultGate(adult.c, adult.holdMs, input.value)) { const fn = adult.onPass; modal = null; adult = null; fn(); refresh(true); }
          else { adult = { ...adult, c: makeAdultChallenge(), holdMs: 0, msg: L('wrongGate') }; refresh(true); }
        }, 'go')));
  }

  function settingsSheet() {
    const sel = (id, value, opts) => h('select', { id }, opts.map(([v, label]) => h('option', { value: v, selected: v === value }, label)));
    const lang = sel('set-lang', settings.lang, [['en', 'English'], ['es', 'Español']]);
    const tr2 = sel('set-tr', settings.translation, [['WEB', 'WEB'], ['KJV', 'KJV'], ['RVR1909', 'RVR 1909']]);
    const mins = h('input', { id: 'set-min', type: 'number', min: '5', max: '240', value: String(settings.minutesPerDay) });
    const qs = h('input', { id: 'set-qs', type: 'time', value: settings.quietStart });
    const qe = h('input', { id: 'set-qe', type: 'time', value: settings.quietEnd });
    const code = h('textarea', { id: 'set-code', readonly: true, rows: '3' }, encodeProgress(env.getProgress()));
    const load = h('input', { id: 'set-load', type: 'text', autocomplete: 'off' });
    const msg = h('p', { class: 'small', 'aria-live': 'polite' });
    return sheet('settings',
      h('h2', {}, `⚙ ${L('settings')}`),
      h('label', {}, L('language'), lang), h('label', {}, L('translation'), tr2),
      h('label', {}, L('minutes'), mins),
      h('label', {}, '🌙', qs, '→', qe),
      h('label', { class: 'col' }, L('saveCode'), code),
      h('label', { class: 'col' }, L('loadCode'), load),
      msg,
      h('div', { class: 'row' },
        btn(L('close'), () => { modal = null; refresh(true); }, 'soft'),
        btn(L('apply'), () => {
          const raw = load.value.trim();
          if (raw) {
            const r = decodeProgress(raw);
            if (!r.ok) { msg.textContent = L('codeBad'); return; }
            env.setProgress(mergeProgress(env.getProgress(), r.progress));
          }
          const langChanged = lang.value !== settings.lang;
          settings = env.setSettings({
            ...settings, lang: lang.value, translation: tr2.value,
            minutesPerDay: Math.max(5, Number(mins.value) || settings.minutesPerDay), quietStart: qs.value || settings.quietStart, quietEnd: qe.value || settings.quietEnd,
          });
          document.documentElement.lang = settings.lang;
          save();
          if (langChanged || raw) { makeSpeaker(); newGame(true); }
          const g = env.gateNow();
          if (g.allowed && game.state().phase === 'stopped' && stopReason !== 'choice') { stopReason = null; game.resume(); }
          modal = null;
          refresh(true);
        }, 'go')));
  }

  function reviewSheet() {
    const q = questionById(review.ids[review.i]);
    return sheet('question',
      h('h2', {}, `🔁 ${L('remember')}`),
      h('p', { class: 'prompt' }, txt(q.prompt)),
      review.hint ? h('p', { class: 'hint' }, `💡 ${review.hint}`) : null,
      h('div', { class: 'picks' }, q.answers.map((a) => picButton(a.pic, txt(a.label), () => {
        if (a.id === q.correct) {
          pendingHistory.push({ questionId: q.id, at: new Date().toISOString(), firstTry: review.tries === 0, review: true });
          say(L('yes'));
          review = { ...review, i: review.i + 1, tries: 0, hint: null };
          if (review.i >= review.ids.length) { review = null; modal = null; save(); }
        } else { review = { ...review, tries: review.tries + 1, hint: txt(q.hint) }; say(txt(q.hint)); }
        refresh(true);
      }))),
      h('div', { class: 'row' }, btn(`🔊 ${L('listen')}`, () => say(promptSpeech(q)), 'soft')));
  }

  function renderHud(st) {
    const voiceLabel = voiceOn && speaker?.available ? `🔊 ${L('voiceOn')}` : `🔇 ${L('voiceOff')}`;
    hudEl.replaceChildren(
      h('button', { type: 'button', class: 'chip', 'aria-pressed': String(voiceOn && Boolean(speaker?.available)), onclick: () => { voiceOn = !voiceOn; if (!voiceOn) speaker?.stop(); refresh(true); } }, voiceLabel),
      h('button', { type: 'button', class: 'chip', onclick: () => { modal = 'book'; bookTab = 'cards'; refresh(true); } }, `🃏 ${st.cards.length}`),
      h('button', { type: 'button', class: 'chip', onclick: () => { modal = 'book'; bookTab = 'badges'; refresh(true); } }, `🏅 ${st.badges.length}`),
      h('button', { type: 'button', class: 'chip', onclick: () => { modal = 'book'; bookTab = 'friends'; refresh(true); } }, `${pic('lamb')} ${st.companions.length + st.itemsFound.length}`),
      h('button', { type: 'button', class: 'chip', onclick: () => { modal = 'book'; bookTab = 'path'; refresh(true); } }, `👣 ${st.path}`),
      canCoop(innerWidth, innerHeight) ? h('button', { type: 'button', class: 'chip', 'aria-pressed': String(coop), onclick: () => { coop = !coop; p2.x = p1.x + 12; p2.y = p1.y; refresh(true); } }, coop ? `👥 ${L('twoPlayers')}` : `👤 ${L('onePlayer')}`) : null,
      h('button', { type: 'button', class: 'chip', 'aria-label': L('grownUps'), onclick: () => openAdult(() => { modal = 'settings'; }) }, '⚙'));
  }

  // Rebuild the sheet only when what it shows changes, so buttons keep focus.
  function refresh(force = false) {
    if (!game) return;
    const st = game.state();
    if (!canCoop(innerWidth, innerHeight)) coop = false;
    const key = JSON.stringify([st.phase, st.questId, modal, bookTab, lastHint, lastRef, stopReason, st.cards.length, st.badges.length, st.itemsFound.length, st.piecesFound.length, st.companions.length, st.path, coop, voiceOn, settings.lang, game.foundSoFar(st.questId || '').length, review?.i, review?.hint, adult?.holdMs, adult?.msg]);
    if (!force && key === rendered) return;
    const prevPhase = rendered ? JSON.parse(rendered)[0] : null;
    const prevQuest = rendered ? JSON.parse(rendered)[1] : null;
    rendered = key;
    renderHud(st);
    let el = null;
    if (modal === 'adult') el = adultSheet();
    else if (modal === 'settings') el = settingsSheet();
    else if (modal === 'book') el = bookSheet(st);
    else if (modal === 'review') el = reviewSheet();
    else if (modal === 'stopAsk') el = stopAskSheet();
    else if (st.phase === 'moment') el = momentSheet(st);
    else if (st.phase === 'question') el = questionSheet(st);
    else if (st.phase === 'choose') el = chooseSheet(st);
    else if (st.phase === 'feedback') el = feedbackSheet();
    else if (st.phase === 'find') el = findBanner(st);
    else if (st.phase === 'stopped') el = stoppedSheet();
    else if (st.phase === 'chapter-end') el = endSheet(st);
    sheetEl.replaceChildren(...(el ? [el] : []));
    sheetEl.dataset.open = el && !el.classList.contains('banner') ? '1' : '';
    if (el && !el.classList.contains('banner')) (el.querySelector('button.go') || el.querySelector('button'))?.focus({ preventScroll: true });
    if (!modal && (st.phase !== prevPhase || st.questId !== prevQuest)) {
      if (st.phase === 'moment') say(txt(scene(st.sceneId).narration));
      if (st.phase === 'question') say(promptSpeech(questById(st.questId).question));
      if (st.phase === 'choose') say(txt(questById(st.questId).prompt));
      if (st.phase === 'find') say(txt(questById(st.questId).hint));
    }
  }

  // ---------- input ----------
  addEventListener('keydown', (e) => {
    if (e.target?.matches?.('input, textarea, select')) return;
    if (/^Arrow|^[wasdWASD]$/.test(e.key)) { keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key); e.preventDefault(); }
  });
  addEventListener('keyup', (e) => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
  addEventListener('blur', () => keys.clear());

  const view = { w: 0, h: 0, scale: 3, camX: 0, camY: 0, dpr: 1, cssScale: 3, top: 0 };
  const toWorld = (sx, sy) => ({ x: sx / view.cssScale + view.camX, y: sy / view.cssScale + view.camY });
  const whoFor = (sx) => (coop && sx > canvas.clientWidth / 2 ? p2 : p1);

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x0: e.offsetX, y0: e.offsetY, x: e.offsetX, y: e.offsetY, t0: performance.now(), who: whoFor(e.offsetX), moved: false });
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.offsetX; p.y = e.offsetY;
    const dx = p.x - p.x0, dy = p.y - p.y0, len = Math.hypot(dx, dy);
    if (len > 10) { p.moved = true; p.who.target = null; p.who.stick = { x: dx / Math.max(len, 40), y: dy / Math.max(len, 40) }; }
  });
  const up = (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    p.who.stick = null;
    if (!p.moved && performance.now() - p.t0 < 400) p.who.target = toWorld(p.x, p.y);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  function dirFor(pl, isP2) {
    let x = 0, y = 0;
    const has = (k) => keys.has(k);
    if (!isP2) { if (has('ArrowLeft')) x--; if (has('ArrowRight')) x++; if (has('ArrowUp')) y--; if (has('ArrowDown')) y++; }
    if (isP2 || !coop) { if (has('a')) x--; if (has('d')) x++; if (has('w')) y--; if (has('s')) y++; }
    if (x || y) { pl.target = null; const l = Math.hypot(x, y); return { x: x / l, y: y / l }; }
    if (pl.stick) return pl.stick;
    if (pl.target) {
      const dx = pl.target.x - pl.x, dy = pl.target.y - pl.y, l = Math.hypot(dx, dy);
      if (l < 2) { pl.target = null; return { x: 0, y: 0 }; }
      return { x: dx / l, y: dy / l };
    }
    return { x: 0, y: 0 };
  }

  const free = (x, y) => passable(world, Math.floor(x / TILE), Math.floor((y + 4) / TILE), game.isUnlocked);

  function bump(x, y) {
    const tile = tileAt(world, Math.floor(x / TILE), Math.floor((y + 4) / TILE));
    if (tile.kind === 'gate' && performance.now() - lastGateToast > 4000) { lastGateToast = performance.now(); toast(`✨ ${L('gateClosed')}`); }
  }

  function move(pl, d, dt) {
    if (!d.x && !d.y) return;
    const nx = pl.x + d.x * SPEED * dt, ny = pl.y + d.y * SPEED * dt;
    let movedAny = false;
    if (free(nx, pl.y)) { pl.x = nx; movedAny = true; } else bump(nx, pl.y);
    if (free(pl.x, ny)) { pl.y = ny; movedAny = true; } else bump(pl.x, ny);
    if (!movedAny) pl.target = null;
    pl.step += dt * 12;
  }

  function touchTiles(pl) {
    const tx = Math.floor(pl.x / TILE), ty = Math.floor((pl.y + 4) / TILE);
    const st = game.state();
    const spot = world.spots.find((s) => s.tx === tx && s.ty === ty) || null;
    if (spot?.id !== pl.onSpot?.id) {
      pl.onSpot = spot;
      if (spot && st.phase === 'explore' && !modal && game.reachSpot(spot.id)) { pl.target = null; lastHint = null; refresh(); return; }
    }
    for (const p of world.pickups) {
      if (p.tx !== tx || p.ty !== ty) continue;
      const have = p.kind === 'item' ? st.itemsFound.includes(p.id) : st.piecesFound.includes(p.id);
      if (!have) { game.found(p.id); toast(`${pic(p.kind === 'piece' ? 'piece' : p.id)} ${L(p.kind)}`); save(); }
    }
    if (st.phase === 'find') {
      for (const f of world.finds) {
        if (f.questId !== st.questId || f.tx !== tx || f.ty !== ty) continue;
        if (game.foundSoFar(st.questId).includes(f.id)) continue;
        const r = game.found(f.id);
        if (r) toast(`${pic(f.id)} ${L('found')}`);
        if (r === 'done') say(L('yes'));
      }
    }
  }

  // ---------- loop ----------
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 3);
    const cw = canvas.clientWidth, chh = canvas.clientHeight;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(chh * dpr);
    // Keep the top band (HUD chips and the find banner) off the world, so nothing hides under them.
    const top = Math.round(Math.min(132, chh * 0.25));
    const cssScale = Math.max(1.5, Math.min((chh - top) / (world.h * TILE), cw / (9 * TILE), 6));
    Object.assign(view, { w: canvas.width, h: canvas.height, scale: cssScale * dpr, cssScale, dpr, top });
    ctx.imageSmoothingEnabled = false;
    refresh(true);
  }
  addEventListener('resize', resize);

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const st = game.state();
    const canWalk = !modal && (st.phase === 'explore' || st.phase === 'find');
    if (canWalk) {
      move(p1, dirFor(p1, false), dt); touchTiles(p1);
      if (coop) { move(p2, dirFor(p2, true), dt); touchTiles(p2); }
    }
    pal.trail.push({ x: p1.x, y: p1.y });
    if (pal.trail.length > 18) { const p = pal.trail.shift(); pal.x = p.x - 6; pal.y = p.y + 2; }
    // Camera follows the explorer (midpoint in co-op), clamped to the world.
    const fx = coop ? (p1.x + p2.x) / 2 : p1.x, fy = coop ? (p1.y + p2.y) / 2 : p1.y;
    const topW = view.top / view.cssScale;
    const vwW = view.w / view.scale, vwH = view.h / view.scale - topW;
    view.camX = Math.max(0, Math.min(world.w * TILE - vwW, fx - vwW / 2));
    view.camY = Math.max(Math.min(0, (world.h * TILE - vwH) / 2), Math.min(world.h * TILE - vwH, fy - vwH / 2)) - topW;
    if (coop && (Math.abs(p2.x - p1.x) > vwW * 0.9 || Math.abs(p2.y - p1.y) > vwH * 0.9)) { p2.x = p1.x + 12; p2.y = p1.y; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#121a33';
    ctx.fillRect(0, 0, view.w, view.h);
    const actors = [];
    if (st.companions.length) actors.push({ kind: 'companion', id: st.companions[0], x: pal.x, y: pal.y });
    actors.push({ kind: 'child', ...p1 });
    if (coop) actors.push({ kind: 'child', ...p2 });
    drawWorld(ctx, view, world, game, actors, now / 1000);
    refresh();
    requestAnimationFrame(frame);
  }

  // ---------- public ----------
  makeSpeaker();
  newGame(true);
  startReview();
  resize();
  requestAnimationFrame(frame);

  return {
    state: () => game.state(),
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    applyGate(g) {
      if (g.allowed) return;
      const ph = game.state().phase;
      if (ph === 'stopped' || ph === 'chapter-end') return;
      stopReason = g.reason;
      game.endAfterScene();
      save();
      refresh(true);
    },
    save,
  };
}
