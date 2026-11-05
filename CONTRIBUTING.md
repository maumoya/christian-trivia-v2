# Contributing

1. Open an issue first for anything bigger than a typo, so we agree on the change.
2. Branch, change, and run the tests locally (Node 20 or newer, no install step):
   ```bash
   npm test
   ```
3. Play it locally with `npm start`, then open http://localhost:8642/.
4. New behavior needs a test in `tests/`. Bug fixes need a test that failed before the fix.
5. Adding or renaming a shipped file? Run `node tools/gen-precache.js` so it works offline.
6. Open a PR. CI (tests and CodeQL) must be green. A maintainer reviews and merges.

## Coding standards

- Plain JavaScript modules (ES2020+), no dependencies, no build step. English in code and docs.
- Two-space indent, single quotes, semicolons, `const`/`let` (never `var`); match the surrounding code.
- Game rules in `src/engine/` stay free of DOM access so tests can run them in Node.
- No third-party hosts, fonts, art or scripts. CodeQL (security-and-quality) runs on every PR.

## Reporting bugs

Open a GitHub issue with the steps, what you expected and what happened. Security problems: see `SECURITY.md`.
