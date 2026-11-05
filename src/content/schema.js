// Chapter content checks: shape (validateChapter) and chronology (checkChronology).
const TYPES = new Set(['answer', 'find', 'choose', 'help']);
const BADGE_KINDS = new Set(['recognition', 'promise', 'blessing', 'journey']);

const isText = (o) => o && typeof o.en === 'string' && o.en.trim() && typeof o.es === 'string' && o.es.trim();

export function validateChapter(ch) {
  const errs = [];
  const need = (cond, msg) => { if (!cond) errs.push(msg); };
  need(ch && typeof ch.id === 'string', 'chapter id missing');
  need(isText(ch?.title), 'title needs en and es');
  need(ch?.memoryVerse?.ref, 'memoryVerse.ref missing');
  need(Array.isArray(ch?.scenes) && ch.scenes.length, 'scenes missing');
  if (errs.length) return errs;

  const ords = new Set();
  const questIds = new Set();
  const typesSeen = new Set();
  for (const s of ch.scenes) {
    need(typeof s.id === 'string', 'scene id missing');
    need(Number.isInteger(s.ord), `${s.id} ord missing`);
    need(!ords.has(s.ord), `${s.id} duplicate ord ${s.ord}`);
    ords.add(s.ord);
    need(Array.isArray(s.refs) && s.refs.length, `${s.id} refs missing`);
    need(isText(s.narration), `${s.id} narration needs en and es`);
    need(isText(s.card), `${s.id} card needs en and es`);
    need(Array.isArray(s.quests), `${s.id} quests missing`);
    for (const q of s.quests || []) {
      need(!questIds.has(q.id), `${q.id} duplicate quest id`);
      questIds.add(q.id);
      need(TYPES.has(q.type), `${q.id} unknown type ${q.type}`);
      need(typeof q.at === 'string', `${q.id} spot missing`);
      typesSeen.add(q.type);
      if (q.type === 'answer') {
        const qu = q.question || {};
        need(isText(qu.prompt), `${qu.id || q.id} prompt needs en and es`);
        need(isText(qu.hint), `${qu.id || q.id} hint needs en and es`);
        need(Array.isArray(qu.answers) && qu.answers.length === 3, `${qu.id || q.id} needs exactly 3 answers`);
        for (const a of qu.answers || []) need(isText(a.label) && a.pic, `${qu.id} answer ${a.id} needs label and pic`);
        need((qu.answers || []).some((a) => a.id === qu.correct), `${qu.id} correct id not among answers`);
      } else if (q.type === 'find') {
        need(Array.isArray(q.items) && q.items.length >= 1, `${q.id} needs items`);
        need(isText(q.hint), `${q.id} hint needs en and es`);
      } else if (q.type === 'choose') {
        need(isText(q.prompt), `${q.id} prompt needs en and es`);
        need(Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 3, `${q.id} needs 2-3 options`);
        for (const o of q.options || []) need(isText(o.label), `${q.id} option ${o.id} needs en and es`);
        need((q.options || []).some((o) => o.id === q.accepted), `${q.id} accepted id is not an option`);
        need(typeof q.ref === 'string' && q.ref, `${q.id} needs a ref`);
        need(isText(q.hint), `${q.id} hint needs en and es`);
      } else if (q.type === 'help') {
        need(typeof q.carry === 'string' && typeof q.to === 'string', `${q.id} needs carry and to`);
      }
    }
  }
  for (const t of ['answer', 'find', 'choose']) need(typesSeen.has(t), `chapter needs at least one ${t} quest`);
  for (const b of ch.badges || []) {
    need(BADGE_KINDS.has(b.kind), `badge ${b.id} unknown kind`);
    need(isText(b.title), `badge ${b.id} title needs en and es`);
    need(b.earnedBy === 'chapter-end' || questIds.has(b.earnedBy), `badge ${b.id} points at unknown quest ${b.earnedBy}`);
  }
  for (const c of ch.companions || []) {
    need(isText(c.name), `companion ${c.id} name needs en and es`);
    need(questIds.has(c.joinsAt), `companion ${c.id} points at unknown quest ${c.joinsAt}`);
  }
  need(isText(ch.end?.tryToday), 'end.tryToday needs en and es');
  need(Array.isArray(ch.end?.reviewSeeds), 'end.reviewSeeds missing');
  return errs;
}

// Every text field a child hears in a scene, with a label and a kind.
function* sceneTexts(scene) {
  yield [`${scene.id} narration`, 'narration', scene.narration];
  yield [`${scene.id} card`, 'card', scene.card];
  for (const q of scene.quests) {
    if (q.type === 'answer') {
      const qu = q.question;
      yield [`${qu.id} prompt`, 'prompt', qu.prompt];
      yield [`${qu.id} hint`, 'hint', qu.hint];
      for (const a of qu.answers) yield [`${qu.id} answer ${a.id}`, 'answer', a.label];
    } else {
      if (q.prompt) yield [`${q.id} prompt`, 'prompt', q.prompt];
      if (q.hint) yield [`${q.id} hint`, 'hint', q.hint];
      for (const o of q.options || []) yield [`${q.id} option ${o.id}`, 'answer', o.label];
    }
  }
}

const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function checkChronology(ch, laterTerms) {
  const errs = [];
  for (const scene of ch.scenes) {
    for (const [label, kind, text] of sceneTexts(scene)) {
      for (const lt of laterTerms) {
        if (lt.firstOrd <= scene.ord) continue;
        if (lt.only && !lt.only.includes(kind)) continue;
        const re = new RegExp(`(?<![\\p{L}])${fold(lt.term)}(?![\\p{L}])`, 'u');
        if (re.test(fold(text.en)) || re.test(fold(text.es))) {
          errs.push(`${label} uses "${lt.term}" (first appears ord ${lt.firstOrd})`);
        }
      }
    }
  }
  return errs;
}
