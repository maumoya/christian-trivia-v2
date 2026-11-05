import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame } from '../src/engine/game.js';
import { computeStars, walkPath, bestOf } from '../src/engine/rewards.js';
import { scheduleReview } from '../src/engine/review.js';
import { DEFAULTS, withDefaults, sessionGate, makeAdultChallenge, checkAdultGate } from '../src/engine/parent.js';
import { encodeProgress, decodeProgress, loadProgress, saveProgress, mergeProgress, EMPTY } from '../src/engine/progress.js';
import { createSpeaker } from '../src/engine/speech.js';

const ch = JSON.parse(fs.readFileSync(new URL('../src/content/ch01.json', import.meta.url), 'utf8'));
const quests = ch.scenes.flatMap((s) => s.quests);

function play(g, q, { wrongFirst = false } = {}) {
  assert.ok(g.reachSpot(q.at), `reach ${q.at}`);
  if (q.type === 'answer') {
    g.momentDone();
    if (wrongFirst) {
      const wrong = q.question.answers.find((a) => a.id !== q.question.correct).id;
      assert.equal(g.answer(wrong).right, false);
    }
    assert.equal(g.answer(q.question.correct).right, true);
  } else if (q.type === 'choose') {
    g.momentDone();
    assert.equal(g.choose(q.accepted).accepted, true);
  } else if (q.type === 'find') {
    for (const it of q.items) g.found(it);
  }
  g.next();
}

test('a full chapter runs to the end with cards, badges and the companion', () => {
  const events = [];
  const g = createGame(ch, { onEvent: (e) => events.push(e) });
  for (const q of quests) play(g, q);
  const s = g.state();
  assert.equal(s.phase, 'chapter-end');
  assert.equal(s.cards.length, 8);
  assert.deepEqual(s.cards, ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']);
  assert.deepEqual(s.badges.sort(), ['b-blessing', 'b-journey-creation']);
  assert.deepEqual(s.companions, ['lamb']);
  assert.equal(s.firstTryRight.length, 9);
  assert.ok(events.some((e) => e.type === 'chapter-end'));
  assert.equal(events.filter((e) => e.type === 'stop-point').length, 8);
});

test('locked areas cannot be reached', () => {
  const g = createGame(ch);
  assert.equal(g.reachSpot('spot-s2'), false);
  play(g, quests[0]);
  assert.equal(g.isUnlocked('s2'), true);
  assert.equal(g.reachSpot('spot-s2'), true);
});

test('first wrong answer gives the hint, second replays the moment', () => {
  const events = [];
  const g = createGame(ch, { onEvent: (e) => events.push(e) });
  g.reachSpot('spot-s1');
  g.momentDone();
  const r1 = g.answer('b');
  assert.equal(r1.hint, 'Watch the dark again. What filled it?');
  const r2 = g.answer('c');
  assert.equal(r2.replayed, true);
  assert.equal(g.state().phase, 'moment');
  g.momentDone();
  assert.equal(g.state().phase, 'question');
  const r3 = g.answer('a');
  assert.deepEqual(r3, { right: true, firstTry: false });
  assert.equal(g.state().firstTryRight.length, 0);
  assert.equal(g.state().hintsUsed, 1);
});

test('Spanish hint comes back in Spanish', () => {
  const g = createGame(ch, { lang: 'es' });
  g.reachSpot('spot-s1');
  g.momentDone();
  assert.equal(g.answer('b').hint, 'Mira la oscuridad otra vez. ¿Qué la llenó?');
});

test('a wrong choice replays the moment and returns to the choice', () => {
  const g = createGame(ch);
  for (const q of quests.slice(0, quests.findIndex((x) => x.id === 'q-tend'))) play(g, q);
  g.reachSpot('spot-s7-tend');
  g.momentDone();
  const r = g.choose('leave');
  assert.equal(r.accepted, false);
  assert.ok(r.hint);
  assert.equal(g.state().phase, 'moment');
  g.momentDone();
  assert.equal(g.state().phase, 'choose');
  assert.equal(g.choose('tend').accepted, true);
});

test('replay of the moment during a question resumes the question', () => {
  const g = createGame(ch);
  g.reachSpot('spot-s1');
  g.momentDone();
  g.replay('moment');
  assert.equal(g.state().phase, 'moment');
  g.momentDone();
  assert.equal(g.state().phase, 'question');
  g.replay('question');
  assert.deepEqual(g.state().replays, { question: 1, moment: 1 });
});

test('story items and verse pieces count anywhere', () => {
  const g = createGame(ch);
  assert.equal(g.found('st-lion'), 'item');
  assert.equal(g.found('vp1'), 'piece');
  assert.equal(g.found('lamb'), null);
  assert.deepEqual(g.state().itemsFound, ['st-lion']);
});

test('endAfterScene stops now in explore, or after the current quest', () => {
  const a = createGame(ch);
  a.endAfterScene();
  assert.equal(a.state().phase, 'stopped');
  a.resume();
  assert.equal(a.state().phase, 'explore');
  const b = createGame(ch);
  b.reachSpot('spot-s1');
  b.endAfterScene();
  b.momentDone();
  b.answer('a');
  b.next();
  assert.equal(b.state().phase, 'stopped');
});

test('restore rebuilds a saved game without events', () => {
  const g1 = createGame(ch);
  for (const q of quests.slice(0, 3)) play(g1, q);
  const saved = g1.state();
  const events = [];
  const g2 = createGame(ch, { onEvent: (e) => events.push(e) });
  events.length = 0;
  g2.restore(saved);
  assert.equal(events.length, 0);
  assert.deepEqual(g2.state().questsDone, saved.questsDone);
  assert.equal(g2.isUnlocked('s4'), true);
  assert.equal(g2.state().path, saved.path);
});

test('stars: finish, items, first-try, pieces, try today', () => {
  const g = createGame(ch);
  for (const q of quests) play(g, q);
  let s = g.state();
  assert.equal(computeStars(s, ch), 2);
  ch.storyItems.forEach((i) => g.found(i));
  ch.versePieces.forEach((i) => g.found(i));
  s = g.state();
  assert.equal(computeStars(s, ch, { tryTodayDone: true }), 5);
  assert.equal(computeStars(createGame(ch).state(), ch), 0);
});

test('mostly wrong first tries lose only the first-try star', () => {
  const g = createGame(ch);
  quests.forEach((q) => play(g, q, { wrongFirst: true }));
  assert.equal(computeStars(g.state(), ch), 1);
});

test('path never goes down and ignores answers', () => {
  assert.equal(walkPath(5, { unlocked: 1, questsDone: 0 }), 5);
  assert.equal(walkPath(0, { unlocked: 2, questsDone: 1 }), 3);
  const right = createGame(ch); play(right, quests[0]);
  const wrong = createGame(ch); play(wrong, quests[0], { wrongFirst: true });
  assert.equal(right.state().path, wrong.state().path);
});

test('bestOf keeps the higher value or the union', () => {
  assert.equal(bestOf(2, 3), 3);
  assert.deepEqual(bestOf(['a'], ['b', 'a']), ['a', 'b']);
  assert.equal(bestOf(false, true), true);
});

test('review: missed first, then stale seeds, max 3, retire after two first-try reviews', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  const h = [
    { questionId: 's4q1', at: '2026-11-09T10:00:00Z', firstTry: false },
    { questionId: 's1q1', at: '2026-11-08T10:00:00Z', firstTry: false },
    { questionId: 's7q1', at: '2026-11-09T10:00:00Z', firstTry: true },
  ];
  assert.deepEqual(scheduleReview(h, ch.end.reviewSeeds, now), ['s1q1', 's4q1', 's8q1']);
  const retired = [
    { questionId: 's1q1', at: '2026-10-01T10:00:00Z', firstTry: true, review: true },
    { questionId: 's1q1', at: '2026-10-02T10:00:00Z', firstTry: true, review: true },
  ];
  assert.ok(!scheduleReview(retired, ['s1q1'], now).includes('s1q1'));
});

test('review compares dates across time zones correctly', () => {
  const h = [
    { questionId: 'a', at: '2026-11-01T01:30:00-05:00', firstTry: false },
    { questionId: 'b', at: '2026-11-01T06:00:00Z', firstTry: false },
  ];
  assert.deepEqual(scheduleReview(h, [], new Date('2026-11-02T00:00:00Z')), ['b', 'a']);
});

test('parent defaults and Spanish translation', () => {
  assert.equal(DEFAULTS.minutesPerDay, 30);
  assert.equal(withDefaults({ lang: 'es' }).translation, 'RVR1909');
  assert.equal(withDefaults({ lang: 'es', translation: 'KJV' }).translation, 'KJV');
});

test('session gate: time, quiet hours past midnight, chapters', () => {
  const noon = new Date(2026, 10, 5, 12, 0);
  assert.deepEqual(sessionGate({}, { minutesToday: 5 }, noon), { allowed: true, endAfterScene: false });
  assert.equal(sessionGate({}, { minutesToday: 30 }, noon).reason, 'time');
  assert.equal(sessionGate({}, {}, new Date(2026, 10, 5, 21, 0)).reason, 'quiet');
  assert.equal(sessionGate({}, {}, new Date(2026, 10, 5, 6, 59)).reason, 'quiet');
  assert.equal(sessionGate({}, {}, new Date(2026, 10, 5, 7, 0)).allowed, true);
  assert.equal(sessionGate({}, { chaptersThisSession: 1 }, noon).reason, 'chapters');
});

test('adult gate needs a 3 s hold and the right product', () => {
  const c = makeAdultChallenge(() => 0.5);
  assert.deepEqual([c.a, c.b, c.answer], [55, 6, 330]);
  assert.equal(checkAdultGate(c, 3000, '330'), true);
  assert.equal(checkAdultGate(c, 2999, '330'), false);
  assert.equal(checkAdultGate(c, 5000, '331'), false);
});

test('progress code round-trips and rejects a typo', () => {
  const p = { v: 1, chapters: { ch01: { stars: 3, questsDone: ['q-s1'], badges: [], companions: [], path: 2, tryTodayDone: false } }, history: [] };
  const code = encodeProgress(p);
  assert.match(code, /^[A-Z0-9]{4}(-[A-Z0-9]{1,4})*$/);
  assert.deepEqual(decodeProgress(code.toLowerCase()), { ok: true, progress: p });
  const typo = code.slice(0, 5) + (code[5] === 'A' ? 'B' : 'A') + code.slice(6);
  assert.deepEqual(decodeProgress(typo), { ok: false, error: 'bad-code' });
  assert.deepEqual(decodeProgress(''), { ok: false, error: 'bad-code' });
});

test('storage: corrupt or throwing storage gives empty progress', () => {
  const mem = new Map();
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.deepEqual(loadProgress(store), EMPTY());
  const p = { v: 1, chapters: { ch01: { stars: 1 } }, history: [] };
  assert.equal(saveProgress(store, p), true);
  assert.deepEqual(loadProgress(store), p);
  mem.set('arca-native-progress', '{nope');
  assert.deepEqual(loadProgress(store), EMPTY());
  const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
  assert.deepEqual(loadProgress(bad), EMPTY());
  assert.equal(saveProgress(bad, p), false);
});

test('merge keeps the best of both devices', () => {
  const a = { v: 1, chapters: { ch01: { stars: 2, questsDone: ['q-s1'], tryTodayDone: true } }, history: [{ questionId: 's1q1', at: 'x' }] };
  const b = { v: 1, chapters: { ch01: { stars: 4, questsDone: ['q-s2'], tryTodayDone: false } }, history: [{ questionId: 's1q1', at: 'x' }] };
  const m = mergeProgress(a, b);
  assert.deepEqual(m.chapters.ch01, { stars: 4, questsDone: ['q-s1', 'q-s2'], tryTodayDone: true });
  assert.equal(m.history.length, 1);
});

test('speaker without a voice reports unavailable', async () => {
  const sp = createSpeaker(null);
  assert.equal(sp.available, false);
  assert.equal(await sp.say('hi'), 'unavailable');
});

test('speaker speaks with a fake synth', async () => {
  class U { constructor(t) { this.text = t; } }
  const synth = { cancel() {}, getVoices: () => [{ lang: 'es-MX' }], speak(u) { this.last = u; u.onend(); } };
  const sp = createSpeaker(synth, { lang: 'es', Utterance: U });
  assert.equal(await sp.say('hola'), 'spoken');
  assert.equal(synth.last.voice.lang, 'es-MX');
});

test('engine uses no timers', () => {
  for (const f of ['game', 'rewards', 'review', 'parent', 'progress']) {
    const src = fs.readFileSync(new URL(`../src/engine/${f}.js`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /setTimeout|setInterval|requestAnimationFrame/, f);
  }
});
