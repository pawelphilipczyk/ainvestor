# AI Investor (Remix 3 scaffold)

Minimal app scaffold built with the Remix 3 direction from the official `remix-run/remix`
repository using the `remix` package (`remix@next`).

## What is included

- Home page with app name
- ETF form (ETF name + status: **Have** or **Want to Buy**)
- Server-side handler that stores entries in memory
- Simple mobile-friendly HTML/CSS
- Basic test coverage for GET + POST flow

## Run locally

```bash
npm install
npm run dev
```

App runs on: `http://localhost:44100`

## Run tests

```bash
npm run test
```

## Type check

```bash
npm run typecheck
```

## Fly.io direction (next step)

This repo now runs as a standard Node HTTP server (`server.ts`) and can be containerized/deployed
to Fly.io in the next iteration.
