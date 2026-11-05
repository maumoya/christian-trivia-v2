# Security policy

## Reporting a vulnerability

If you find a problem, for example a way the game could run code it should not or send data anywhere,
report it privately through GitHub's
[private vulnerability reporting](https://github.com/maumoya/christian-trivia-v2/security/advisories/new).
You will get an answer within 7 days. Please do not open a public issue for security problems.

## What the game promises

- Static files only: HTML, plain JavaScript modules and JSON. No server code, no accounts, no ads,
  no analytics, no data sent anywhere.
- No file references another host (a test checks every shipped file).
- Progress and settings stay in your browser (localStorage). A service worker caches the game so it works offline.
- The grown-ups area is behind a simple adult check.

## Supported versions

Only the latest release is supported.
