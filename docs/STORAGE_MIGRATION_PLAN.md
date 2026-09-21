# Storage Migration Plan — gists → GitHub repositories

**Status:** planned, not started. Phase 0 is cleared to begin; Phases 1+ are
designed but not yet detailed to the commit level.

This plan replaces gist-backed storage with repository-backed storage, and
removes guest mode first because it shrinks the surface the migration has to
carry.

## Why move off gists

Four problems, all hit in practice:

1. **No conditional write.** Every write is a read-modify-write of a whole file
   with no compare-and-swap. A browser tab and an MCP client racing means the
   later write silently wins. Documented today in `README.md` and in the
   `record_operation` tool description (`mcp/ainvestor-server.ts`).
2. **Truncation.** Gist files over 1 MB come back truncated from the API. The
   catalog already crossed it; `readFullGistFileContent`
   (`app/features/catalog/lib.ts`) exists solely to re-fetch from `raw_url`.
3. **Discovery by brute force.** `findGistIdByDescription` (`app/lib/gist.ts`)
   pages through up to 5000 gists to find one file, with duplicate-creation
   guards layered on top.
4. **Unauthenticated catalog reads.** `fetchSharedCatalogSnapshot`
   (`app/features/catalog/lib.ts`) sends no `Authorization` header, so catalog
   reads share the 60-requests/hour-per-IP anonymous bucket for the whole Fly
   app, propped up by a 60s in-process TTL cache.

What is **not** a reason: size, query complexity, or write volume. The data is
a handful of small JSON documents per user. No database engine is needed, and
none is proposed.

## What must survive

The gist is not only storage — it is the authorization model:

- The server holds **no credential that can read user data**. Data lives in the
  user's own GitHub account, reached with the user's own token.
- `/mcp` is a pure token pass-through; GitHub is the authorization server and
  the app never becomes one.

Any design that moves user data into infrastructure the app owns gives this up.
That is the property the chosen design is built around.

## Decisions taken

| Decision | Choice | Rationale |
|---|---|---|
| User data location | `<login>/ainvestor-data`, **private** | Per-user, per-token, preserves the credential-free model |
| Catalog location | `<owner>/ainvestor-catalog`, **private** | See below |
| Catalog read credential | the **caller's** token | No server-side credential; possible only because guests lose catalog access |
| Auth mechanism | OAuth App, scope `gist` → `repo` | See below |
| Organization | **not now** | See below |
| Concurrency | Contents API `sha` as compare-and-swap | Returns `409` on mismatch — the actual payoff of this migration |
| Multi-file atomicity | Git Data API (blobs → tree → commit) | Catalog writes two files in one gist `PATCH` today; a commit preserves that and adds a parent-sha CAS |

### Why the catalog stays private

A public repo is indexed and searchable — strictly worse than today. A secret
gist is *unlisted*, not access-controlled (`README.md` says so), and its id
already travels through Fly config, GitHub Actions secrets, and every user's
plaintext `claude_desktop_config.json`. A private repo is the first time the
catalog is genuinely access-controlled.

The threat model is **"don't advertise,"** not "must never leak." That is why a
rotating server-side read credential is not worth its upkeep here.

### Why the caller's token, and not a server credential

A private repo cannot be read anonymously, so *something* must authenticate.
The alternative was a fine-grained read-only PAT in Fly secrets. It was
rejected because its only real advantage was keeping guests working, and guests
are being removed anyway. Reading with the caller's token keeps the app holding
zero credentials for both stores.

### Why `repo` scope and not a GitHub App

A GitHub App is the only way to get true least privilege (per-repo
`contents: write`). It was considered and deferred:

- Classic OAuth App scopes are all-or-nothing. `repo` reaches every repository
  on the account — broader in blast radius than `gist`, and **this is a
  regression that belongs in the README honestly, not glossed over.**
- Against a one-to-few-user app with a "don't advertise" threat model, that
  regression is acceptable in exchange for Phase 2 being a scope string plus a
  re-auth rather than a new auth architecture (installation flow, user-to-server
  tokens, ~8h expiry and refresh, and changes to the MCP discovery metadata).
- An earlier draft of this plan argued the App could hold catalog read access
  too, consolidating credentials. That argument died when the catalog moved to
  caller-token reads.

**Revisit when:** the approved-user count grows past a handful, or the catalog
repo moves to an organization.

### Why no organization yet

Option "collaborators read with their own token" nominally needs an org,
because personal-repo collaborators always get **write** access and only orgs
offer a Read role. But `APPROVED_GITHUB_LOGINS`
(`app/lib/approved-github-logins.ts`) currently holds one login — the catalog
owner — so today the owner's own token reads it and no collaborator exists.

The read path is identical whether the reader is the owner or a Read-role
collaborator, so the org can wait until a second approved user appears: transfer
the repo, add them, no code change.

---

# Phase 0 — remove guest mode

**Goal:** an unauthenticated visitor can reach the home page and sign in, and
nothing else. This is a prerequisite: it removes the anonymous catalog read that
blocks a private catalog repo, and it collapses a second code path through every
feature handler.

## There are three session states, and only one is being removed

| State | Identified by | Fate |
|---|---|---|
| Guest — no login at all | no `login` in session | **removed** |
| Signed in, pending approval | `approvalStatus: 'pending'`, token stripped by `stripGithubTokenIfUnapproved` | **stays** |
| Signed in, approved | `token` + `gistId` present | stays |

This distinction is the main trap in Phase 0. `getSessionIdentity` and
`getLayoutSession` (`app/lib/session.ts`) exist to serve the *pending* state and
must not be deleted along with guest handling. Copy that today reads "guest or
signed-in user without a private gist" — for example the comment on
`app/features/advice/advice-page.tsx` — narrows to the pending case only.

## Inventory

**Delete outright:**
- `app/lib/guest-session-state.ts` and `app/lib/guest-session-state.test.ts`
  (note: `getGuestCatalog` / `setGuestCatalog` in it are **already dead** — only
  their own test references them)

**Remove the guest branch from:**
- `app/features/catalog/catalog-load-context.ts` — the `getGuestEtfs` fallback
  in `loadCatalogPageContext`
- `app/features/portfolio/index.ts` — six call sites
- `app/features/portfolio/portfolio-operation-form/index.ts` — four call sites
- `app/features/guidelines/index.ts` — eight call sites, including the
  server-side guest guidelines LRU

**Rename, do not delete:**
- `resetGuestCatalog` (`app/router.ts`, re-exported from
  `app/features/catalog/index.ts`) is **not guest state** — it is
  `resetTestSessionCookieJar`, a test helper with a misleading name. A naive
  grep-and-delete breaks the suite. Rename it to match what it does.

**Copy (both locales, per the i18n rule in `AGENTS.md`):**
- `portfolio.signInPersist`, `guidelines.subtitle.signIn` and neighbours in
  `app/locales/en.ts` and `app/locales/pl.ts` — "sign in to persist" stops being
  true when there is nothing to persist without signing in.

## The opportunity: one auth gate instead of many

There is **no auth middleware today**. `app/router.ts` builds its chain from
`remix/middleware/*` and ends with `enforceGithubApproval()`, which only strips
unapproved tokens — every controller then does its own session check and its own
guest fallback.

Phase 0 should add a `requireApprovedSession()` middleware next to
`enforceGithubApproval()`, redirecting to `routes.auth.login` for anything that
is not the home page, the auth routes, the locale route, `/health`, the MCP
routes, or the asset server. Per the Remix rule in `AGENTS.md`, build it on
`remix/middleware` and `remix/response/redirect` rather than hand-rolling.

That turns "check the session, else fall back to guest" — repeated across five
controllers — into one gate, and is the reason Phase 0 is expected to *remove*
more code than it adds.

## Done when

- No module imports from `guest-session-state.ts`; the file is gone
- An unauthenticated request to `/portfolio`, `/guidelines`, `/catalog`,
  `/advice`, `/admin` redirects to login
- The pending-approval state still renders its own screen (a regression test
  should pin this specifically — it is the state most likely to be broken by
  mistake)
- `npm run check`, `npm test`, `npm run typecheck` pass; `npm run test:browser`
  passes for any touched client entry
- `README.md` no longer advertises guest ETF entry

---

# Phases 1–6 — the storage migration

Each phase ships green on its own.

### Phase 1 — extract the storage port, still on gists

A pure refactor, no behaviour change. There are **four copies of
`githubHeaders`** (`app/lib/gist.ts`, `app/lib/guidelines.ts`,
`app/features/advice/advice-gist.ts`, `app/features/catalog/lib.ts`) and four
near-identical `GistPayload` shapes. Per the pattern-capture rule in
`AGENTS.md`, that repetition is collapsed into one module *before* the backend
is swapped, or the migration becomes four parallel rewrites.

```ts
// app/lib/store/github-store.ts
type StoredDocument<T> = { value: T; version: string | null } // version = blob sha

readDocument({ token, location, path })
writeDocument({ token, location, path, value, expectedVersion })
writeDocuments({ token, location, files, expectedCommit })
```

`version` is `null` throughout this phase. Tests stay green. **This is where the
risk is actually removed** — it is worth landing as its own PR regardless of
what follows.

### Phase 2 — repo backend behind the same port

Implemented alongside the gist backend, selected by env var. Both coexist.
Create repos with `auto_init: true`: an empty repo has no default branch and the
Contents API 404s on it. Detect an existing-but-foreign repo by an ownership
marker file, not by name alone.

### Phase 3 — auth

`scope: 'gist'` → `'repo'` in `app/features/auth/index.ts`. Forces every user to
re-authorize. README security section updated per the decision above.

### Phase 4 — data migration

On first login after the switch, copy gist → repo. **Leave the gists intact and
read-only** as a backstop for a release or two; do not delete on migrate.

### Phase 5 — turn on compare-and-swap

Thread `expectedVersion` through every write and surface `409` as a visible
"changed elsewhere, reload" instead of a silent overwrite. **This is the payoff;
everything before it is plumbing.**

Two doc changes fall out: the lost-update warning in `README.md` gets deleted
rather than reworded, and the `record_operation` tool description in
`mcp/ainvestor-server.ts` stops telling the model that concurrent writes
overwrite and stops pointing at gist Revisions for recovery.

### Phase 6 — catalog to its own private repo

`fetchCatalog()` and `fetchSharedCatalogSnapshot()` currently take **no
arguments** because the read is anonymous. Both gain a token parameter, which
ripples to roughly twelve call sites across `app/features/catalog/index.ts`,
`catalog-load-context.ts`, `admin/index.ts`, `auth/index.ts`,
`guidelines/index.ts`, `portfolio/index.ts` and
`portfolio/portfolio-operation-form/index.ts`, plus `mcp/tools/catalog.ts`
(which already has the caller's token).

Phase 0 is what makes this tractable: without it, several of those call sites
have no token to pass.

The two-file catalog write (`catalog.json` + `catalog-source.json`, one `PATCH`
today) becomes one Git Data commit — same atomicity, plus CAS on the parent.

### Phase 7 — remove the gist backend

Delete the gist implementation, the env vars, and the gist language throughout
`README.md` and `docs/MCP_SERVER_PLAN.md`.

## Traps

- **GitHub returns `404`, not `403`, for a private repo you cannot see.** "Not a
  collaborator" and "does not exist" are indistinguishable. This bites hardest
  at `app/features/auth/index.ts`, which reads the catalog *during login* to
  decide admin status: a `404` there must mean "not an admin, no catalog access"
  and must not break the login. Needs a deliberate branch and a test.
- The Contents API is base64 and keeps a 1 MB ceiling on the JSON response —
  catalog reads use the raw media type or Git Data blobs.
- `AINVESTOR_GIST_ID`, the `x-ainvestor-gist-id` header, and the approved-logins
  allowlist all need repo equivalents (`mcp/config.ts`, `mcp/data-gist.ts`).
- Test seams assume gist shapes: `app/lib/private-gist-fetch-test-overlay.ts`,
  `setSharedCatalogForTests`, `app/lib/test-session-fetch.ts`. 27 test files
  mention gists.

## Open questions

1. Repo naming — `ainvestor-data` per user is assumed; preview currently
   separates by gist description (`ai-investor-preview-data`), so preview needs
   its own repo name.
2. Whether Phase 4 migration is silent on login or an explicit "move my data"
   action.
3. Whether the `catalog-source.json` bank-import history should move at all, or
   be archived — it is the largest file and is read by code, never by people.
