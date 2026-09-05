# AI Investor (Remix 3 scaffold)

Minimal app scaffold built with the Remix 3 direction from the official `remix-run/remix`
repository using the `remix` package (`remix@next`).

## Prerequisites

- **Node.js** `24.3.0` or later (matches the `remix` package `engines` field used by this app).

## What is included

- Home page with app name
- ETF form (ETF name + status: **Have** or **Want to Buy**)
- **GitHub OAuth login** — sign in with your GitHub account
- **GitHub Gist database** — your ETF list is stored in a private Gist in your own GitHub account (no external DB required)
- **Shared ETF catalog** — the catalog is loaded from one public GitHub Gist shared by all users
- Unauthenticated guests can still add ETFs (stored in memory for the session)
- Simple mobile-friendly HTML/CSS
- Test coverage for session helpers, Gist utilities, and all route handlers

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `GH_CLIENT_ID` | Yes (for auth) | Client ID of your GitHub OAuth App |
| `GH_CLIENT_SECRET` | Yes (for auth) | Client secret of your GitHub OAuth App |
| `SHARED_CATALOG_GIST_ID` | Yes | Public GitHub Gist ID that stores the shared `catalog.json` file |
| `SESSION_SECRET` | Recommended | Random string used to sign session cookies (defaults to a weak dev value) |

### Shared catalog gist

The ETF catalog now lives in a **single public gist** shared by all users.

- The gist must contain `catalog.json`
- Set `SHARED_CATALOG_GIST_ID` to that gist's ID
- The **owner of that gist** is the only user who can import catalog updates from the UI
- All other users can browse and use the catalog, but cannot import changes

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
export SHARED_CATALOG_GIST_ID=your_public_catalog_gist_id
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

## MCP server (read your data from an AI client)

`mcp/server.ts` exposes your AI Investor data to MCP clients over stdio. It reads
the same private GitHub Gist the web app uses, so it needs no running server.

It is **read-only** today and exposes one tool:

- **`get_portfolio`** — every holding with its value and currency, the portfolio
  total, and each holding's share of it.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `GH_TOKEN` | Yes | GitHub personal access token with the **`gist`** scope |
| `SHARED_CATALOG_GIST_ID` | Yes | Public gist holding `catalog.json` (same value the app uses) |
| `AINVESTOR_GIST_ID` | No | Pins the private data gist. When unset it is found by description |
| `AINVESTOR_MCP_ALLOW_WRITES` | No | Reserved for future write tools; the server is read-only regardless today |

Create the token at [GitHub → Settings → Developer settings → Personal access
tokens](https://github.com/settings/tokens) and grant it the **`gist`** scope
only. The server never creates a gist: if none is found it tells you to sign in
to the web app once, or to set `AINVESTOR_GIST_ID`.

To find your data gist id, list your gists (secret gists are matched by
**description**, not filename — `ai-investor-data`, or `ai-investor-preview-data`
for the preview app):

```bash
curl -s -H "Authorization: Bearer $GH_TOKEN" \
     -H "Accept: application/vnd.github+json" \
     "https://api.github.com/gists?per_page=100" \
| jq -r '.[] | select(.description | test("ai-investor")) | "\(.id)  \(.description)"'
```

### Claude Desktop

Edit `claude_desktop_config.json` — on macOS at
`~/Library/Application Support/Claude/`, on Windows at `%APPDATA%\Claude\` —
and add the server. Use absolute paths; Claude Desktop does not run inside the
project directory:

```json
{
  "mcpServers": {
    "ainvestor": {
      "command": "/absolute/path/to/ainvestor/node_modules/.bin/tsx",
      "args": ["/absolute/path/to/ainvestor/mcp/server.ts"],
      "env": {
        "GH_TOKEN": "ghp_your_token_here",
        "SHARED_CATALOG_GIST_ID": "your_public_catalog_gist_id",
        "AINVESTOR_GIST_ID": "your_private_data_gist_id"
      }
    }
  }
}
```

Run `npm install` first so `node_modules/.bin/tsx` exists, then restart Claude
Desktop. The token sits in that config file in plain text, so keep the `gist`
scope and nothing more.

### Running it directly

```bash
GH_TOKEN=... SHARED_CATALOG_GIST_ID=... npm run mcp
```

The process speaks JSON-RPC on stdin/stdout and logs to stderr. It is not
interactive; use it through an MCP client.

### What the data cannot answer

Holdings store a **monetary value only** — no quantity, price, or date, and
there is no transaction history. Questions about returns, performance over time,
or when something was bought cannot be answered from this data. When holdings
span several currencies no total is reported, because the app applies no FX
conversion.

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
- `SHARED_CATALOG_GIST_ID` — the public gist ID for the shared ETF catalog
- `SESSION_SECRET` — a random string (generate with `openssl rand -hex 32`)

Also update the **Authorization callback URL** in your GitHub OAuth App to your Fly.io app URL:
`https://ainvestor.fly.dev/auth/github/callback`

## PR preview deployments

`.github/workflows/fly-review.yml` deploys PR branches to a **single stable preview app** at `https://ainvestor-preview.fly.dev`. One URL for all PRs — no need to update OAuth callback when switching PRs.

- **Triggers:** opened, reopened, or updated PRs
- **Preview URL:** `https://ainvestor-preview.fly.dev` (stable, never changes)
- **Secrets:** `FLY_API_TOKEN` (org-scoped) is required for the workflow. `SESSION_SECRET`, `GH_CLIENT_ID_PREVIEW`, `GH_CLIENT_SECRET_PREVIEW`, and `SHARED_CATALOG_GIST_ID` are used for **one-time** configuration of the preview Fly app (see below); the workflow does not push them on every run so deploys stay fast.
- **Note:** Only one PR is previewed at a time (the most recently pushed). Pushing to a different PR overwrites the preview.

Configure Fly secrets for the preview app **once** (after creating the app or when rotating credentials):

```bash
flyctl secrets set \
  GH_CLIENT_ID="<from GH_CLIENT_ID_PREVIEW>" \
  GH_CLIENT_SECRET="<from GH_CLIENT_SECRET_PREVIEW>" \
  SHARED_CATALOG_GIST_ID="<shared public catalog gist id>" \
  SESSION_SECRET="<from SESSION_SECRET>" \
  --app ainvestor-preview
```

### OAuth on preview

Create a separate OAuth App for previews with **Authorization callback URL** set once to:

`https://ainvestor-preview.fly.dev/auth/github/callback`

Add `GH_CLIENT_ID_PREVIEW` and `GH_CLIENT_SECRET_PREVIEW` as repository secrets. No need to change the callback URL when testing different PRs.
