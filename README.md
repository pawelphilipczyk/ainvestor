# AI Investor (Remix 3 scaffold)

Minimal app scaffold built with the Remix 3 direction from the official `remix-run/remix`
repository using the `remix` package (`remix@next`).

## What is included

- Home page with app name
- ETF form (ETF name + status: **Have** or **Want to Buy**)
- **GitHub OAuth login** — sign in with your GitHub account
- **GitHub Gist database** — your ETF list is stored in a private Gist in your own GitHub account (no external DB required)
- Unauthenticated guests can still add ETFs (stored in memory for the session)
- Simple mobile-friendly HTML/CSS
- Test coverage for session helpers, Gist utilities, and all route handlers

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `GH_CLIENT_ID` | Yes (for auth) | Client ID of your GitHub OAuth App |
| `GH_CLIENT_SECRET` | Yes (for auth) | Client secret of your GitHub OAuth App |
| `SESSION_SECRET` | Recommended | Random string used to sign session cookies (defaults to a weak dev value) |

### Creating a GitHub OAuth App

1. Go to [GitHub Developer Settings → OAuth Apps](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Set **Authorization callback URL** to `http://localhost:44100/auth/github/callback` (or your production URL)
4. Copy the **Client ID** and generate a **Client Secret**

### Running locally

Create a `.env` file (or export variables in your shell):

```bash
export GH_CLIENT_ID=your_client_id
export GH_CLIENT_SECRET=your_client_secret
export SESSION_SECRET=$(openssl rand -hex 32)
```

Then:

```bash
npm install
npm run dev
```

App runs on: `http://localhost:44100`

## Run tests

```bash
npm run test
```

`npm run test` auto-installs dependencies with `npm ci` when `node_modules` is missing.

## Type check

```bash
npm run typecheck
```

`npm run check` also auto-installs dependencies with `npm ci` when needed.

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

Add these repository secrets in GitHub before relying on the workflow:

- `FLY_API_TOKEN` (create with `fly tokens create deploy`)
- `GH_CLIENT_ID` — your OAuth App client ID
- `GH_CLIENT_SECRET` — your OAuth App client secret
- `SESSION_SECRET` — a random string (generate with `openssl rand -hex 32`)

Also update the **Authorization callback URL** in your GitHub OAuth App to your Fly.io app URL:
`https://ainvestor.fly.dev/auth/github/callback`
