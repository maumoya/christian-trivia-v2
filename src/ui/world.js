// The overworld: 8 areas side by side, one per scene. Pure data, no DOM, so it can be tested.
export const TILE = 16;
export const AREA_W = 18;
export const AREA_H = 14;
export const DOOR_ROWS = [6, 7];

export const THEMES = [
  { ground: '#26355f', deco: 'wave', accent: '#f6d77a' },   // 1 dark water, then light
  { ground: '#8fc3e6', deco: 'cloud', accent: '#ffffff' },  // 2 sky and waters
  { ground: '#7cae63', deco: 'sprout', accent: '#f2c14e' }, // 3 land and plants
  { ground: '#2c3a5c', deco: 'star', accent: '#fff3b0' },   // 4 sun, moon, stars
  { ground: '#e3cf9a', deco: 'shell', accent: '#4fa3c7' },  // 5 sea and birds
  { ground: '#93bf6a', deco: 'grass', accent: '#c98b4b' },  // 6 animals
  { ground: '#5e9d59', deco: 'fruit', accent: '#e05d5d' },  // 7 the garden
  { ground: '#dcc9a3', deco: 'sun', accent: '#f0a64a' },    // 8 rest
];

// Local tile spots for 1, 2 or 3 quests in an area.
const SPOT_LAYOUT = { 1: [[9, 6]], 2: [[6, 4], [12, 9]], 3: [[5, 4], [9, 10], [13, 4]] };
const FIND_SPOTS = [[3, 11], [15, 2], [14, 11]];
const ITEM_SPOTS = [[2, 2], [15, 11], [16, 2], [2, 11]];

export function buildWorld(ch) {
  const scenes = [...ch.scenes].sort((a, b) => a.ord - b.ord);
  const w = AREA_W * scenes.length;
  const h = AREA_H;
  const spots = [];
  scenes.forEach((s, i) => {
    const at = SPOT_LAYOUT[s.quests.length] || SPOT_LAYOUT[3];
    s.quests.forEach((q, k) => {
      const [x, y] = at[k % at.length];
      spots.push({ id: q.at, questId: q.id, sceneId: s.id, type: q.type, tx: i * AREA_W + x, ty: y });
    });
  });
  const pickups = [];
  (ch.storyItems || []).forEach((id, k) => {
    const [x, y] = ITEM_SPOTS[Math.floor(k / scenes.length) % ITEM_SPOTS.length];
    pickups.push({ id, kind: 'item', tx: (k % scenes.length) * AREA_W + x, ty: y });
  });
  (ch.versePieces || []).forEach((id, k) => pickups.push({ id, kind: 'piece', tx: k * AREA_W + 9, ty: 12 }));
  const finds = [];
  scenes.forEach((s, i) => s.quests.filter((q) => q.type === 'find').forEach((q) => {
    q.items.forEach((id, k) => {
      const [x, y] = FIND_SPOTS[k % FIND_SPOTS.length];
      finds.push({ id, questId: q.id, tx: i * AREA_W + x, ty: y });
    });
  }));
  const gates = scenes.slice(1).map((s, i) => ({ sceneId: s.id, tx: (i + 1) * AREA_W }));
  return { w, h, scenes, spots, pickups, finds, gates, start: { tx: 3, ty: 7 } };
}

// Tile kinds: 'edge' (blocked), 'gate' (blocked unless its scene is open), 'floor'.
export function tileAt(world, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) return { kind: 'edge' };
  if (ty === 0 || ty === world.h - 1 || tx === 0 || tx === world.w - 1) return { kind: 'edge' };
  if (tx % AREA_W === 0) {
    const gate = world.gates.find((g) => g.tx === tx);
    if (gate && DOOR_ROWS.includes(ty)) return { kind: 'gate', sceneId: gate.sceneId };
    return { kind: 'edge' };
  }
  return { kind: 'floor' };
}

export function passable(world, tx, ty, isUnlocked) {
  const t = tileAt(world, tx, ty);
  return t.kind === 'floor' || (t.kind === 'gate' && isUnlocked(t.sceneId));
}

export const areaOf = (px) => Math.max(0, Math.floor(px / (AREA_W * TILE)));

// Small deterministic hash for decoration placement.
export const hash = (x, y) => {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
