# Project Guidelines

## Build and Test

- Use Node 24 or newer. Install with `npm ci`. Build with `npm run build` (tsc). Test with `npm test` (Mocha + Sinon + c8).
- Coverage thresholds: 90% lines/branches/statements, 85% functions.

## Architecture

- CloudIngenium fork of Bitfinex REST v1 & v2 API wrapper for Node.js.
- Published as `@jcbit/bfx-api-node-rest` to GitHub Packages and npm.
- TypeScript 5.9, ESM-only (no CommonJS).
- Adds: `RateLimitError`, `InsufficientFundsError`, `NetworkError`, `retry_with_backoff()`.

## Conventions

- Husky git hooks for pre-commit. In CI, set `HUSKY=0`.
- Lint with ESLint 9 + typescript-eslint.
- Docs generated via TypeDoc.
