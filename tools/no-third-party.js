// No-third-party gate: shipped files may only reference their own origin.
import fs from 'node:fs';
import path from 'node:path';

const URL_RE = /\b(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'`)<]*/gi;
// Bible source URLs are provenance records inside data files; they are never fetched.
const ALLOWED_DATA_KEYS = /"source":\s*"https:\/\/ebible\.org\/[^"]*"/g;

export function findThirdParty(text) {
  const cleaned = text.replace(ALLOWED_DATA_KEYS, '').replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '');
  return [...cleaned.matchAll(URL_RE)].map((m) => m[0]);
}

export function scanShipped(root, files) {
  const hits = [];
  for (const f of files) {
    for (const u of findThirdParty(fs.readFileSync(path.join(root, f), 'utf8'))) hits.push(`${f}: ${u}`);
  }
  return hits;
}
