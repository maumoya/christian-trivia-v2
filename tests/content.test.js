import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateChapter, checkChronology } from '../src/content/schema.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const ch = read('src/content/ch01.json');
const later = read('src/content/later-terms.json');
const bibles = ['kjv', 'web', 'rvr1909'].map((t) => read(`src/bible/${t}-gen1-2.json`));

test('chapter 1 passes the schema', () => {
  assert.deepEqual(validateChapter(ch), []);
});

test('schema rejects a bad chapter', () => {
  const bad = structuredClone(ch);
  bad.scenes[0].quests[0].question.correct = 'z';
  bad.badges[0].earnedBy = 'q-nope';
  const errs = validateChapter(bad);
  assert.ok(errs.includes('s1q1 correct id not among answers'));
  assert.ok(errs.some((e) => e.includes('unknown quest q-nope')));
});

test('chapter 1 keeps chronology', () => {
  assert.deepEqual(checkChronology(ch, later), []);
});

test('chronology catches a later name', () => {
  const bad = structuredClone(ch);
  bad.scenes[6].quests[0].question.hint.en = 'Ask Eve.';
  assert.deepEqual(checkChronology(bad, later), ['s7q1 hint uses "Eve" (first appears ord 101)']);
});

test('every scene ref resolves in all three Bibles', () => {
  for (const b of bibles) {
    assert.equal(Object.keys(b.verses).length, 56);
    assert.equal(b.licence, 'Public domain');
    for (const s of ch.scenes) for (const r of s.refs) assert.ok(b.verses[r], `${b.translation} ${r}`);
  }
});

test('memory verse matches the public-domain sources', () => {
  const [kjv, web, rvr] = bibles;
  assert.equal(kjv.verses['Gen 1:1'], 'In the beginning God created the heaven and the earth.');
  assert.equal(web.verses['Gen 1:1'], 'In the beginning, God created the heavens and the earth.');
  assert.equal(rvr.verses['Gen 1:1'], 'En el principio crió Dios los cielos y la tierra.');
});

test('quests follow the design table', () => {
  const qs = Object.fromEntries(ch.scenes.flatMap((s) => s.quests.map((q) => [q.id, q])));
  assert.equal(qs['q-tend'].accepted, 'tend');
  assert.equal(qs['q-rest'].accepted, 'rest');
  assert.deepEqual(qs['q-find-animals'].items, ['lamb', 'lizard', 'bear']);
  assert.equal(ch.companions[0].joinsAt, 'q-find-animals');
  assert.equal(ch.badges.find((b) => b.kind === 'blessing').earnedBy, 'q-s7a');
  assert.equal(ch.storyItems.length, 12);
  assert.deepEqual(ch.end.reviewSeeds, ['s1q1', 's4q1', 's7q1', 's8q1']);
});
