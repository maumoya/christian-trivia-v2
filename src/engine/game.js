// Chapter engine: pure state machine, no DOM, no timers. The UI calls it and listens to events.
import { walkPath } from './rewards.js';

export function createGame(ch, { lang = 'en', onEvent = () => {} } = {}) {
  const scenes = [...ch.scenes].sort((a, b) => a.ord - b.ord);
  const spots = new Map();
  for (const s of scenes) for (const q of s.quests) spots.set(q.at, { scene: s, quest: q });
  const questScene = new Map(scenes.flatMap((s) => s.quests.map((q) => [q.id, s])));
  const allQuests = scenes.flatMap((s) => s.quests);
  const ordOf = (id) => scenes.find((s) => s.id === id).ord;

  const st = {
    chapter: ch.id, sceneId: scenes[0].id, phase: 'explore', questId: null, questionId: null,
    questsDone: [], firstTryRight: [], hintsUsed: 0, replays: { question: 0, moment: 0 },
    cards: [], itemsFound: [], piecesFound: [], badges: [], companions: [], path: 0,
  };
  const unlocked = new Set([scenes[0].id]);
  const attempts = new Map();
  const finds = new Map(); // find quest id -> Set of items found
  let resumePhase = null;
  let stopAfter = false;
  let quiet = false; // restore() replays completions without events

  const emit = (type, data = {}) => { if (!quiet) onEvent({ type, ...data }); };
  const quest = () => allQuests.find((q) => q.id === st.questId);
  const updatePath = () => { st.path = walkPath(st.path, { unlocked: unlocked.size, questsDone: st.questsDone.length }); };

  function completeQuest(q) {
    if (st.questsDone.includes(q.id)) return;
    st.questsDone.push(q.id);
    emit('quest-done', { questId: q.id });
    const scene = questScene.get(q.id);
    if (q.opensGate) unlocked.add(q.opensGate);
    for (const b of ch.badges || []) {
      if (b.earnedBy === q.id && !st.badges.includes(b.id)) { st.badges.push(b.id); emit('badge', { id: b.id }); }
    }
    for (const c of ch.companions || []) {
      if (c.joinsAt === q.id && !st.companions.includes(c.id)) { st.companions.push(c.id); emit('companion', { id: c.id }); }
    }
    const answers = scene.quests.filter((x) => x.type === 'answer');
    if (answers.every((x) => st.questsDone.includes(x.id)) && !st.cards.includes(scene.id)) {
      st.cards.push(scene.id);
      st.cards.sort((a, b) => ordOf(a) - ordOf(b));
      emit('card', { id: scene.id });
    }
    if (scene.quests.every((x) => st.questsDone.includes(x.id))) emit('stop-point', { sceneId: scene.id });
    updatePath();
  }

  function finishChapter() {
    st.phase = 'chapter-end';
    for (const b of ch.badges || []) {
      if (b.earnedBy === 'chapter-end' && !st.badges.includes(b.id)) { st.badges.push(b.id); emit('badge', { id: b.id }); }
    }
    emit('chapter-end');
  }

  const api = {
    lang,
    state: () => structuredClone({ ...st, unlocked: [...unlocked] }),
    isUnlocked: (sceneId) => unlocked.has(sceneId),
    questAt: (spotId) => spots.get(spotId)?.quest || null,
    isDone: (questId) => st.questsDone.includes(questId),

    reachSpot(spotId) {
      if (st.phase !== 'explore') return false;
      const hit = spots.get(spotId);
      if (!hit || !unlocked.has(hit.scene.id) || st.questsDone.includes(hit.quest.id)) return false;
      st.sceneId = hit.scene.id;
      st.questId = hit.quest.id;
      const t = hit.quest.type;
      st.phase = t === 'answer' || t === 'choose' ? 'moment' : t;
      if (t === 'find' && !finds.has(hit.quest.id)) finds.set(hit.quest.id, new Set());
      return true;
    },

    momentDone() {
      if (st.phase !== 'moment') return;
      const q = quest();
      if (resumePhase) { st.phase = resumePhase; resumePhase = null; } else st.phase = q.type === 'answer' ? 'question' : 'choose';
      if (st.phase === 'question') { st.questionId = q.question.id; emit('question-shown', { questionId: q.question.id }); }
    },

    answer(id) {
      if (st.phase !== 'question') return { right: false };
      const q = quest();
      const qu = q.question;
      const n = attempts.get(qu.id) || 0;
      attempts.set(qu.id, n + 1);
      if (id === qu.correct) {
        const firstTry = n === 0;
        if (firstTry) st.firstTryRight.push(qu.id);
        emit('answered', { questionId: qu.id, right: true, firstTry });
        st.phase = 'feedback';
        completeQuest(q);
        return { right: true, firstTry };
      }
      emit('answered', { questionId: qu.id, right: false, firstTry: false });
      if (n === 0) { st.hintsUsed++; return { right: false, hint: qu.hint[lang] || qu.hint.en }; }
      st.replays.moment++;
      st.phase = 'moment';
      resumePhase = 'question';
      emit('replayed', { kind: 'moment' });
      return { right: false, replayed: true };
    },

    choose(id) {
      if (st.phase !== 'choose') return { accepted: false };
      const q = quest();
      if (id === q.accepted) { st.phase = 'feedback'; completeQuest(q); return { accepted: true, ref: q.ref }; }
      st.hintsUsed++;
      st.replays.moment++;
      st.phase = 'moment';
      resumePhase = 'choose';
      emit('replayed', { kind: 'moment' });
      return { accepted: false, hint: q.hint[lang] || q.hint.en };
    },

    found(id) {
      if ((ch.storyItems || []).includes(id)) { if (!st.itemsFound.includes(id)) st.itemsFound.push(id); return 'item'; }
      if ((ch.versePieces || []).includes(id)) { if (!st.piecesFound.includes(id)) st.piecesFound.push(id); return 'piece'; }
      if (st.phase === 'find') {
        const q = quest();
        if (!q.items.includes(id)) return null;
        const set = finds.get(q.id);
        set.add(id);
        if (q.items.every((x) => set.has(x))) { st.phase = 'feedback'; completeQuest(q); return 'done'; }
        return 'find';
      }
      return null;
    },
    foundSoFar: (questId) => [...(finds.get(questId) || [])],

    delivered(spotId) {
      if (st.phase !== 'help') return false;
      const q = quest();
      if (q.to !== spotId) return false;
      st.phase = 'feedback';
      completeQuest(q);
      return true;
    },

    replay(kind) {
      if (kind !== 'question' && kind !== 'moment') return;
      st.replays[kind]++;
      emit('replayed', { kind });
      if (kind === 'moment' && (st.phase === 'question' || st.phase === 'choose')) { resumePhase = st.phase; st.phase = 'moment'; }
    },

    // Leave a find or help quest without finishing it (walk away); progress on it is kept.
    cancel() { if (st.phase === 'find' || st.phase === 'help') { st.phase = 'explore'; st.questId = null; } },

    next() {
      if (st.phase !== 'feedback') return;
      st.questId = null;
      st.questionId = null;
      if (allQuests.every((q) => st.questsDone.includes(q.id))) { finishChapter(); return; }
      if (stopAfter) { st.phase = 'stopped'; emit('stopped'); return; }
      st.phase = 'explore';
    },

    endAfterScene() {
      if (st.phase === 'explore') { st.phase = 'stopped'; emit('stopped'); } else stopAfter = true;
    },
    resume() { if (st.phase === 'stopped') { stopAfter = false; st.phase = 'explore'; } },

    // Rebuild a saved game: quests done, items, pieces. First-try history is not replayed.
    restore(saved = {}) {
      quiet = true;
      for (const id of saved.questsDone || []) {
        const q = allQuests.find((x) => x.id === id);
        if (q) completeQuest(q);
      }
      for (const id of [...(saved.itemsFound || []), ...(saved.piecesFound || [])]) api.found(id);
      for (const id of saved.firstTryRight || []) if (!st.firstTryRight.includes(id)) st.firstTryRight.push(id);
      st.path = Math.max(st.path, saved.path || 0);
      quiet = false;
      if (allQuests.every((q) => st.questsDone.includes(q.id))) st.phase = 'chapter-end';
    },
  };
  emit('start', { chapter: ch.id });
  return api;
}
