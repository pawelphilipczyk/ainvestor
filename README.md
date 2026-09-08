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
| `APPROVED_GITHUB_LOGINS` | No | Extra GitHub logins allowed in, on top of `app/lib/approved-github-logins.ts` |
| `AINVESTOR_PUBLIC_ORIGIN` | For MCP off Fly | Origin the deployment is reached on; becomes the OAuth issuer in MCP discovery |
| `AINVESTOR_GIST_ID` | No | Pins the data gist the MCP server reads, for approved logins only (see [MCP server](#mcp-server-use-your-data-from-an-ai-client)) |
| `SHARED_CATALOG_GIST_ID` | Yes (MCP too) | Also required by the stdio MCP server, which refuses to start without it |

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
## MCP server (use your data from an AI client)

Exposes your AI Investor data to MCP clients, from the same private GitHub Gist
the web app uses. Your own data, no extra configuration:

- **`get_portfolio`** — every holding with its value and currency, the portfolio
  total, and each holding's share of it.
- **`get_guidelines`** — your target allocation: every guideline row, the sum of
  the targets, and the effective target per asset class (a named-fund row counts
  toward its own asset class, so the aggregated buckets are the numbers to
  reason with).
- **`set_guideline`** — create or update one target: an asset class
  (`kind: "asset_class"` with `etfType`) or a named fund (`kind: "instrument"`
  with `ticker`). There is one row per asset class and one per ticker, so
  setting an existing one updates it. A target that would push the sum of all
  rows above 100% is refused.
- **`delete_guideline`** — remove one row by the `id` that `get_guidelines`
  reports.
- **`get_buy_plan`** — what to buy with a given amount of cash. For
  each asset class with a target: what it holds now, what the target comes to
  once the cash is invested, the smallest purchase that closes the gap, and the
  slice of the cash to put there. It is **buy-only** — nothing is ever sold, so a
  class already above target simply keeps what it has.

  It returns **numbers only** — no tickers and no written analysis. It is the
  same arithmetic the web app's advice page already treats as authoritative,
  exposed on its own so a client can have the figures without paying for an
  OpenAI call. Picking the actual funds is the client's job, from the catalog.

  The maths needs one currency throughout, since the app does no FX conversion.
  Holdings in several currencies, cash in a currency the holdings are not in, no
  guidelines at all, or a holding whose asset class has no target each yield **no
  numbers and a plain statement of which of those it was** — never an estimate.

- **`get_saved_advice`** — the written analysis the advice page last saved, in
  either of its modes: `buy_next` or `portfolio_review`. It arrives as text, with
  the timestamp it was written at and the cash amount it was written for, because
  it is a **snapshot**: nothing recomputes it, so the holdings and targets it
  reasons about may have moved since. When nothing is saved, the answer says so —
  and says whether the file is missing or unreadable — rather than inventing an
  analysis. Free, and the default choice for "what did the advice page last say".
- **`generate_advice`** — writes a **fresh** analysis by calling OpenAI, the same
  path the advice page itself uses: `buy_next` (the default) proposes concrete
  purchases for a given amount of cash, `portfolio_review` is a qualitative
  health check of the holdings as they stand. **This costs money, per call**,
  charged to this server's own `OPENAI_API_KEY` — reach for it only when you
  explicitly want new written analysis, not for a routine "what should I buy"
  (`get_buy_plan`) or "what did it last say" (`get_saved_advice`, which is free).
  The result is returned as text and is not persisted unless you pass
  `save: true`, which writes it to the gist exactly as the advice page's own
  Generate button does — overwriting whatever was saved there before for that
  mode. A failed save is reported alongside the generated text rather than
  losing an analysis that already cost money to produce.
- **`record_operation`** — buy or sell one holding by its shared-catalog ticker.
  A buy adds to the matching row (matched by ticker — or name, for a legacy
  tickerless row — **and** currency together) or creates one if none matches; a
  sell reduces it and drops the row once it reaches zero, and is refused if it
  would go below zero. The ticker must resolve against the shared catalog — this
  tool cannot invent a row for an arbitrary name.
- **`remove_holding`** — delete one holding outright by the `id` that
  `get_portfolio` reports. Useful for correcting a bad row without computing the
  exact value a sell would need to bring it to zero.

The shared ETF catalog is reachable too, and it is the only source of valid
tickers — a fund it does not list is one you may not be able to buy:

- **`list_catalog`** — funds matching a free-text query over ticker, name and
  description, as compact rows. The answer always carries `matched` and
  `truncated`, so a limited list is never mistaken for the whole catalog.
- **`get_catalog_entry`** — one fund in full, by ticker or id.
- **`upsert_catalog_entry`** — add a fund or update fields of one already there.
  The row is found by ticker, and a partial update keeps every field it does
  not mention — isin included, so it never needs repeating.
- **`delete_catalog_entry`** — remove one fund.
- **`import_catalog_from_bank_file`** — refresh the catalog from a bank API
  response or a DevTools HAR **saved on the machine running the server**. Take
  `dryRun: true` first to see what would change. Available **only over stdio**:
  the deployed server cannot read your disk, and a HAR is far larger than the
  256 KB an MCP request body may carry.

The three catalog writes are **owner-only**. The catalog is one public gist
shared by everyone using the app, and GitHub lets only its owner write to it;
the tools check that first, so a wrong token is told which account owns the
catalog instead of getting a bare `404`.

The same three datasets are also readable as MCP **resources** —
`ainvestor://portfolio`, `ainvestor://guidelines` and `ainvestor://catalog` —
for clients that attach data to a conversation rather than call a tool for it.
Each carries exactly what its tool returns, except that the catalog resource is
the whole list rather than one page of search results.

A guideline write is a read-modify-write of the whole `guidelines.json` file,
and a holdings write (`record_operation`, `remove_holding`) the same for
`etfs.json`; the gist API has no conditional write, so an edit you make in a
browser tab between the read and the save is overwritten rather than merged.
Nothing is lost, though: every write is a gist revision, so the previous
content is still under **Revisions** on the gist page and can be restored from
there.

There are two ways to reach it. Both need a **classic** GitHub personal access
token with the **`gist`** scope and nothing else — fine-grained tokens cannot
access gists. Create one at
[Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens).
### Remote — works from any client, including mobile

The deployed app answers MCP at `POST /mcp` (for example
`https://ainvestor.fly.dev/mcp`), and signs you in **through GitHub**. The app
never becomes an authorization server of its own and stores no credential: it
publishes OAuth discovery metadata that names GitHub as the authorization
server, the client runs the standard authorization-code + PKCE flow against
GitHub, and the GitHub token it receives is the credential `/mcp` expects.

You need a GitHub **OAuth App** of your own, because the client must present
preregistered credentials — dynamic client registration is not offered.

1. Create one at
   [Settings → Developer settings → OAuth Apps](https://github.com/settings/developers).
2. Add the connector in your Claude client: give it the URL
   `https://ainvestor.fly.dev/mcp`, turn **Requires sign-in** on, and paste the
   OAuth App's **Client ID** and **Client secret**.
3. The client will send you to GitHub to authorize the `gist` scope, then start
   using the connector.

**The redirect URI is the usual stumbling block.** Set **Authorization callback
URL** — not Homepage URL, which is cosmetic — to the address your client returns
to. For the Claude apps that is:

```
https://claude.ai/api/mcp/auth_callback
```

Verified working from the Claude mobile app. If another client rejects it, the
failed authorization lands on a GitHub error page whose own URL carries the
`redirect_uri` parameter the client actually sent; copy that value in.

Leave **Allow wildcard matching** off — strict redirect matching is the main
defence against authorization-code interception — and **Enable Device Flow** off,
since this flow does not use it.

Discovery endpoints, should you want to inspect them:

```bash
curl -s https://ainvestor.fly.dev/.well-known/oauth-protected-resource | jq
curl -s https://ainvestor.fly.dev/.well-known/oauth-authorization-server | jq
```

#### What the deployment has to be told

The discovery documents publish this deployment's own origin, and that origin
becomes the OAuth issuer a client signs in against — so it is never taken from a
request header, which any caller can set. It is `AINVESTOR_PUBLIC_ORIGIN` when
set, otherwise `https://$FLY_APP_NAME.fly.dev` (Fly puts the app name in the
machine's environment), otherwise a loopback host so local runs work. Anywhere
else, set `AINVESTOR_PUBLIC_ORIGIN`; until you do, the discovery endpoints answer
`500` rather than guess.

By default every caller reads **their own** data gist, found from the token they
present, so the server can serve anyone. Setting `AINVESTOR_GIST_ID` on the
deployment pins one specific gist instead — and since a secret gist is unlisted
rather than access-controlled, holding its id is enough to read it. A pinned gist
is therefore served only to a caller whose GitHub login is on the same allowlist
the web app uses (`APPROVED_GITHUB_LOGINS`, in
`app/lib/approved-github-logins.ts` or the environment); anyone else gets `403`
and the gist is never fetched on their behalf.

A caller can still name a gist per request with the `x-ainvestor-gist-id` header.
That needs no allowlist: it reads only what the caller's own token can already
reach.

Two things to weigh before relying on this:

- The `gist` scope is all-or-nothing — it reads and writes **every** gist on your
  account. Fine-grained tokens cannot access gists at all, so this is the only
  option GitHub offers.
- A GitHub token is not bound to this server as its audience, which the MCP
  security guidance would otherwise prefer. In practice the server is your own,
  but the token it receives is valid at GitHub generally, not just here.
- Guideline and holdings writes are open to every caller, each one writing only
  the gist their own token reaches — a stranger's token never touches your data.

### Local — stdio, via Claude Desktop

Claude Desktop launches the server itself as a subprocess. There is **no
localhost and no port**: you do not start anything, you tell the app what to run.

```bash
git clone https://github.com/pawelphilipczyk/ainvestor && cd ainvestor && npm install
```

Then edit `claude_desktop_config.json` — macOS
`~/Library/Application Support/Claude/`, Windows `%APPDATA%\Claude\` — using
**absolute** paths, since Claude Desktop does not run inside the project:

```json
{
  "mcpServers": {
    "ainvestor": {
      "command": "/absolute/path/to/ainvestor/node_modules/.bin/tsx",
      "args": ["/absolute/path/to/ainvestor/mcp/server.ts"],
      "env": {
        "GH_TOKEN": "ghp_your_token_here",
        "AINVESTOR_GIST_ID": "your_private_data_gist_id",
        "SHARED_CATALOG_GIST_ID": "shared_catalog_gist_id"
      }
    }
  }
}
```

Restart Claude Desktop and ask what is in your portfolio. The token sits in that
file in plain text, so keep its scope to `gist`.

`SHARED_CATALOG_GIST_ID` is **required**: the catalog tools read it, and
`set_guideline` uses it to resolve a fund's ticker and asset class exactly as the
web app's form does. The server refuses to start without it rather than let an
unconfigured catalog look like an empty one.

`OPENAI_API_KEY` is optional. Every tool works without it; only `generate_advice`
needs it, and calling that tool while it is unset fails with a clear error
instead of the server refusing to start.

Running `npm run mcp` yourself is not useful: the process waits for JSON-RPC on
stdin and prints only a `[mcp] ready` line on stderr. That is correct, not broken.

### Finding your data gist id

Secret gists are matched by **description** (`ai-investor-data`, or
`ai-investor-preview-data` on the preview app), not by filename, which is why
they can be hard to spot in the GitHub UI:

```bash
curl -s -H "Authorization: Bearer $GH_TOKEN" \
     -H "Accept: application/vnd.github+json" \
     "https://api.github.com/gists?per_page=100" \
| jq -r '.[] | select(.description | test("ai-investor")) | "\(.id)  \(.description)"'
```

The server never creates a gist. If none is found it says so and points you at
signing in to the web app once, or pinning an id.

### Protocol

MCP revisions **2025-11-25** and **2025-06-18**. Older revisions are declined
during negotiation, because 2025-03-26 requires servers to accept JSON-RPC
batches and this one does not implement them.

It advertises the **`tools`** and **`resources`** capabilities and nothing else:
no prompts, no resource subscriptions, and no server-initiated messages, which
is why the HTTP endpoint answers `GET` with `405` instead of opening an SSE
stream.

### What the data cannot answer

Holdings store a **monetary value only** — no quantity, price, or date, and there
is no transaction history. Questions about returns, performance over time, or
when something was bought cannot be answered from this data. When holdings span
several currencies no total is reported, because the app applies no FX
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
