# CLAUDE.md — bfx-api-node-rest

## Project Purpose

CloudIngenium fork of the official Bitfinex REST v1 & v2 API wrapper for Node.js. Published as `@jcbit/bfx-api-node-rest` to GitHub Packages and npm. Used as a dependency by `@jcbit/bitfinex-api-node` and indirectly by BfxLendingBot.

## Stack

- **Language:** TypeScript 5.9 (ESM-only, no CommonJS)
- **Runtime:** Node.js >= 24
- **Build:** `tsc` (output to `dist/`)
- **Test:** Mocha + Sinon + c8 (coverage thresholds: 90% lines/branches/statements, 85% functions)
- **Lint:** ESLint 9 + typescript-eslint
- **Docs:** TypeDoc
- **Git hooks:** Husky

## Build & Dev

```bash
npm ci                # Install dependencies
npm run build         # Compile TypeScript
npm test              # Lint + build + unit tests with coverage
npm run unit          # Unit tests only (with c8 coverage)
npm run lint          # ESLint check
npm run lint:fix      # ESLint auto-fix
npm run docs          # Generate TypeDoc documentation
```

## Structure

```
src/
  index.ts            # Package entry — exports RESTv1, RESTv2
  rest1.ts            # RESTv1 client (deprecated)
  rest2.ts            # RESTv2 client (primary)
  errors.ts           # Custom error types
  types/              # Type declarations for untyped dependencies
    bfx-api-mock-srv.d.ts
    bfx-api-node-models.d.ts
    bfx-api-node-util.d.ts
test/                 # Mocha test suites
dist/                 # Compiled output (git-tracked for consumers)
examples/             # Usage examples
```

## Key Dependencies

- `bfx-api-node-models` — Bitfinex data model classes
- `bfx-api-node-util` — Shared utilities (nonce, auth helpers)
- `bfx-api-mock-srv` (dev) — Mock server for tests

## Conventions

- Uses native `fetch` (no polyfills) — Node 24+
- All API methods return Promises and accept optional callback
- Set `transform: true` to get model instances instead of raw arrays
- RESTv1 is deprecated; all new work should target RESTv2
- Never hardcode API keys — always use environment variables
