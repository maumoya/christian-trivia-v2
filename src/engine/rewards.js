// Stars, path steps and best-of merging. Never reads which answer a child picked.
export function computeStars(state, ch, { tryTodayDone = false } = {}) {
  const all = ch.scenes.flatMap((s) => s.quests.map((q) => q.id));
  if (!all.every((id) => state.questsDone.includes(id))) return 0;
  const answerIds = ch.scenes.flatMap((s) => s.quests.filter((q) => q.type === 'answer').map((q) => q.question.id));
  let stars = 1;
  if ((ch.storyItems || []).every((id) => state.itemsFound.includes(id))) stars++;
  const firstTry = state.firstTryRight.filter((id) => answerIds.includes(id)).length;
  if (firstTry > answerIds.length / 2) stars++;
  if ((ch.versePieces || []).every((id) => state.piecesFound.includes(id))) stars++;
  if (tryTodayDone) stars++;
  return stars;
}

// The path only grows: unlocked areas plus quests done. Wrong answers never move it back.
export function walkPath(prev, { unlocked = 0, questsDone = 0 } = {}) {
  return Math.max(prev || 0, unlocked + questsDone);
}

export function bestOf(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return [...new Set([...(a || []), ...(b || [])])];
  if (typeof a === 'number' || typeof b === 'number') return Math.max(a || 0, b || 0);
  if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a || b);
  return a ?? b;
}
