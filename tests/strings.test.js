import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STRINGS, t, setStrict } from '../src/strings/strings.js';
import { PICS } from '../src/ui/pics.js';
import { buildWorld, tileAt, passable, AREA_W } from '../src/ui/world.js';

const ch = JSON.parse(fs.readFileSync('src/content/ch01.json', 'utf8'));

test('English and Spanish have the same keys', () => {
  assert.deepEqual(Object.keys(STRINGS.es).sort(), Object.keys(STRINGS.en).sort());
});

test('every L() key used by the UI exists', () => {
  const src = fs.readFileSync('src/ui/app.js', 'utf8');
  const keys = [...src.matchAll(/\bL\('([a-zA-Z]+)'\)/g)].map((m) => m[1]);
  assert.ok(keys.length > 20);
  setStrict(true);
  try { for (const k of keys) assert.ok(t(k, 'es')); } finally { setStrict(false); }
});

test('every picture key in the chapter has a picture', () => {
  const keys = new Set();
  JSON.stringify(ch, (k, v) => { if (k === 'pic') keys.add(v); return v; });
  for (const s of ch.scenes) for (const q of s.quests) for (const i of q.items || []) keys.add(i);
  for (const i of ch.storyItems) keys.add(i);
  for (const k of keys) assert.ok(PICS[k], `no picture for ${k}`);
});

test('world: every quest has a spot on floor, gates block until opened', () => {
  const w = buildWorld(ch);
  const quests = ch.scenes.flatMap((s) => s.quests);
  assert.equal(w.spots.length, quests.length);
  for (const s of [...w.spots, ...w.pickups, ...w.finds, { tx: w.start.tx, ty: w.start.ty }]) {
    assert.equal(tileAt(w, s.tx, s.ty).kind, 'floor', JSON.stringify(s));
  }
  const g = w.gates[0];
  assert.equal(passable(w, g.tx, 6, () => false), false);
  assert.equal(passable(w, g.tx, 6, () => true), true);
  assert.equal(passable(w, AREA_W, 2, () => true), false);
});
