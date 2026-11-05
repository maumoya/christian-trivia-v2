// Originality gate: finds blocklisted names in shipped files.
import fs from 'node:fs';
import path from 'node:path';

const SKIP = new Set(['design', 'node_modules', '.git', 'tests', 'tools']);
const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function loadBlocklist(file) {
  return fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
}

function matcher(term) {
  const esc = fold(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  // "Link" is an ordinary English word in lowercase, so it is matched case-sensitively.
  const flags = term === 'Link' ? 'g' : 'gi';
  return new RegExp(`(?<![A-Za-z])${esc}(?![A-Za-z])`, flags);
}

export function scanText(text, terms) {
  const folded = fold(text);
  return terms.filter((t) => matcher(t).test(folded));
}

export function scanNames(root, terms) {
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(e.name) && dir === root) continue;
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|json|html|css|md|webmanifest|txt)$/.test(e.name) && e.name !== 'blocklist.txt') {
        for (const t of scanText(fs.readFileSync(p, 'utf8'), terms)) hits.push(`${path.relative(root, p)}: ${t}`);
      }
    }
  };
  walk(root);
  return hits;
}

if (process.argv[1] && process.argv[1].endsWith('scan-names.js')) {
  const [root = '.', list = 'design/blocklist.txt'] = process.argv.slice(2);
  const hits = scanNames(root, loadBlocklist(list));
  hits.forEach((h) => console.error(h));
  process.exit(hits.length ? 1 : 0);
}
