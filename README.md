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

## Deploy to Fly.io

This repo now includes `fly.toml` and a health endpoint at `/health`.

1. Install Fly CLI and authenticate:

```bash
fly auth login
```

2. If needed, set your app name in `fly.toml` (`app = "ainvestor"`).

3. Deploy:

```bash
fly deploy
```

4. Open the app:

```bash
fly open
```

## GitHub Actions auto-deploy

This repo includes `.github/workflows/deploy-fly.yml` to deploy automatically on each push to
`main` (after PR merge).

Add this repository secret in GitHub before relying on the workflow:

- `FLY_API_TOKEN` (create with `fly tokens create deploy`)
