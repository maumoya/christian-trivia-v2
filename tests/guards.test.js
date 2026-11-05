import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadBlocklist, scanText, scanNames } from '../tools/scan-names.js';
import { findThirdParty, scanShipped } from '../tools/no-third-party.js';
import { PRECACHE } from '../precache-list.js';

const terms = loadBlocklist('design/blocklist.txt');

test('blocklist catches names, accents and case', () => {
  assert.deepEqual(scanText('a pokemon game', terms), ['Pokémon']);
  assert.deepEqual(scanText('ZELDA', terms), ['Zelda']);
  assert.deepEqual(scanText('Link the hero', terms), ['Link']);
  assert.deepEqual(scanText('a link to the page', terms), []);
});

test('shipped files hold no blocklisted names', () => {
  assert.deepEqual(scanNames('.', terms), []);
});

test('third-party detector flags other hosts', () => {
  assert.equal(findThirdParty('<script src="https://cdn.example.com/x.js">').length, 1);
  assert.equal(findThirdParty('fetch("./src/content/ch01.json")').length, 0);
});

test('no shipped file references another host', () => {
  assert.deepEqual(scanShipped('.', PRECACHE.map((p) => p.replace(/^\.\//, '')).filter((p) => p && p !== '')), []);
});

test('precache list covers every shipped file', () => {
  const shipped = ['index.html', 'manifest.webmanifest', 'precache-list.js'];
  for (const dir of ['src', 'icons']) {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) =>
      e.isDirectory() ? walk(`${d}/${e.name}`) : shipped.push(`${d}/${e.name}`));
    walk(dir);
  }
  const listed = new Set(PRECACHE.map((p) => p.replace(/^\.\//, '')));
  for (const f of shipped) assert.ok(listed.has(f), `not precached: ${f}`);
});
