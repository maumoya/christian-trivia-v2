// Local save plus a code to move progress to another device (base32 + CRC32). Nothing leaves the device.
import { bestOf } from './rewards.js';

export const EMPTY = () => ({ v: 1, chapters: {}, history: [] });
export const KEY = 'arca-native-progress';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function crc32(bytes) {
  let c = ~0;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function toB32(bytes) {
  let bits = 0, val = 0, out = '';
  for (const b of bytes) {
    val = ((val << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5) { out += ALPHA[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHA[(val << (5 - bits)) & 31];
  return out;
}

function fromB32(s) {
  let bits = 0, val = 0;
  const out = [];
  for (const ch of s) {
    const i = ALPHA.indexOf(ch);
    if (i < 0) throw new Error('bad');
    val = ((val << 5) | i) & 0xffff;
    bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}

export function encodeProgress(p) {
  const body = new TextEncoder().encode(JSON.stringify(p));
  const all = new Uint8Array(body.length + 4);
  all.set(body);
  new DataView(all.buffer).setUint32(body.length, crc32(body));
  return toB32(all).match(/.{1,4}/g).join('-');
}

export function decodeProgress(code) {
  try {
    const bytes = fromB32(String(code).toUpperCase().replace(/[^A-Z0-9]/g, ''));
    if (bytes.length < 5) return { ok: false, error: 'bad-code' };
    const body = bytes.slice(0, -4);
    const crc = new DataView(bytes.buffer, bytes.byteOffset + bytes.length - 4, 4).getUint32(0);
    if (crc32(body) !== crc) return { ok: false, error: 'bad-code' };
    const p = JSON.parse(new TextDecoder().decode(body));
    if (!p || p.v !== 1 || typeof p.chapters !== 'object') return { ok: false, error: 'bad-code' };
    return { ok: true, progress: { history: [], ...p } };
  } catch {
    return { ok: false, error: 'bad-code' };
  }
}

export function loadProgress(storage) {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return EMPTY();
    const p = JSON.parse(raw);
    return p && p.v === 1 && p.chapters && typeof p.chapters === 'object' ? { history: [], ...p } : EMPTY();
  } catch {
    return EMPTY();
  }
}

export function saveProgress(storage, p) {
  try { storage?.setItem(KEY, JSON.stringify(p)); return true; } catch { return false; }
}

export function mergeProgress(a, b) {
  const out = EMPTY();
  const ids = new Set([...Object.keys(a?.chapters || {}), ...Object.keys(b?.chapters || {})]);
  for (const id of ids) {
    const x = a?.chapters?.[id] || {}, y = b?.chapters?.[id] || {}, m = {};
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) m[k] = bestOf(x[k], y[k]);
    out.chapters[id] = m;
  }
  const seen = new Set();
  out.history = [...(a?.history || []), ...(b?.history || [])].filter((h) => {
    const k = `${h.questionId}|${h.at}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return out;
}
