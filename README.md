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

- `FLY_API_TOKEN` — use `fly tokens create org -o personal` (or your org name). An org-scoped token is required for PR preview deployments, which create new apps. It also works for production deploys.
- `GH_CLIENT_ID` — your OAuth App client ID
- `GH_CLIENT_SECRET` — your OAuth App client secret
- `SESSION_SECRET` — a random string (generate with `openssl rand -hex 32`)

Also update the **Authorization callback URL** in your GitHub OAuth App to your Fly.io app URL:
`https://ainvestor.fly.dev/auth/github/callback`

## PR preview deployments

`.github/workflows/fly-review.yml` deploys a live preview for each pull request. Each PR gets its own Fly app (e.g. `pr-42-ainvestor-org.fly.dev`) so you can review changes without affecting production.

- **Triggers:** opened, reopened, or updated PRs
- **Secrets:** `FLY_API_TOKEN`, `SESSION_SECRET`, plus `GH_CLIENT_ID_PREVIEW` and `GH_CLIENT_SECRET_PREVIEW` (see below)
- **Token requirement:** `FLY_API_TOKEN` must be an **org-scoped token** (`fly tokens create org -o personal`), not an app-scoped deploy token. PR previews create new apps, which requires org-level permissions.
- **Cleanup:** The preview app is destroyed when the PR is closed

### OAuth on preview apps

GitHub OAuth Apps allow only one callback URL. Preview apps use different URLs per PR (`pr-27-...fly.dev`, `pr-28-...fly.dev`, etc.), so use a **separate OAuth App** for previews:

1. Create a second OAuth App at [GitHub Developer Settings → OAuth Apps](https://github.com/settings/developers) (e.g. "AI Investor Preview")
2. Set its **Authorization callback URL** to the preview app you want to test, e.g. `https://pr-27-pawelphilipczyk-ainvestor.fly.dev/auth/github/callback` (update when testing a different PR)
3. Add these repository secrets: `GH_CLIENT_ID_PREVIEW`, `GH_CLIENT_SECRET_PREVIEW`

The preview workflow uses these instead of the production OAuth credentials. Unauthenticated features (browsing, adding ETFs as guest) work without OAuth.
