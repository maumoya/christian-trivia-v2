// Spaced review: up to 3 question ids. Missed ones first (oldest first), then seeds not seen for 7 days.
// Two first-try reviews in a row retire a question. Dates are compared as Dates, never as strings.
const DAY = 86400000;

export function scheduleReview(history, seeds, now = new Date()) {
  const by = new Map();
  for (const h of history || []) {
    if (!by.has(h.questionId)) by.set(h.questionId, []);
    by.get(h.questionId).push(h);
  }
  for (const hs of by.values()) hs.sort((a, b) => new Date(a.at) - new Date(b.at));
  const retired = (id) => {
    const rs = (by.get(id) || []).filter((h) => h.review);
    return rs.length >= 2 && rs.slice(-2).every((h) => h.firstTry);
  };
  const last = (id) => {
    const hs = by.get(id);
    return hs && hs.length ? new Date(hs[hs.length - 1].at) : null;
  };
  const missed = [...by.keys()]
    .filter((id) => !retired(id) && !by.get(id).at(-1).firstTry)
    .sort((a, b) => last(a) - last(b));
  const out = [...missed];
  for (const id of seeds || []) {
    if (out.includes(id) || retired(id)) continue;
    const l = last(id);
    if (!l || new Date(now) - l >= 7 * DAY) out.push(id);
  }
  return out.slice(0, 3);
}
