# Storage Migration Plan — gists → GitHub repositories

**Status:** Phases 0–1 done. Phase 2 (repo backend) is next; Phases 3+ are
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
| User data location | `<login>/ainvestor-data`, **private**, personal account | Per-user, per-token, preserves the credential-free model |
| Catalog location | `ainvestor-shared/ainvestor-catalog`, **private**, under a GitHub **organization** | See below |
| Catalog read credential | the **caller's** token | No server-side credential; possible only because guests lose catalog access |
| Auth mechanism | OAuth App, scope `gist` → `repo` | See below |
| Organization | **yes**, free tier, for the catalog only | See below |
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

**Revisit when:** the approved-user count grows past a handful. Moving the
catalog repo to an organization (below) does not revive the App question —
an org's Read role changes who can read the repo, not how the server
authenticates, and the server still authenticates as nobody: every request
carries the caller's own token, App or no App.

### Why an organization for the catalog

Option "collaborators read with their own token" nominally needs an org,
because **personal-repo collaborators always get write access** — a personal
repo has no read-only role. Only a GitHub organization's Team feature offers
one: a Team can be given the **Read** role on a specific repo, which lets its
members clone and read but never push.

This was checked against GitHub's own docs rather than assumed, because the
pricing page's own summary of team permissions is easy to misread as
paid-gated. It isn't: **GitHub Free** already includes unlimited private
repositories and Team-based repository roles (Read/Triage/Write/
Maintain/Admin) for organizations of any size. The paid Team ($4/user/mo) and
Enterprise ($21/user/mo) tiers add SSO/SCIM, enforced required reviewers,
mandatory code owners, and audit logs — not role-based access itself.

Decision: the organization is **`ainvestor-shared`**, free tier, holding the
catalog repo only (`ainvestor-shared/ainvestor-catalog`, private), with a
**Read**-role team that approved users are added to for catalog access.
Per-user data repos stay under each user's own personal account
(`<login>/ainvestor-data`) — the organization is scoped to the catalog, not
the whole migration. Adding or removing a catalog reader becomes a
team-membership change, no code or infrastructure change.

---

# Phase 0 — remove guest mode ✅

**Done.** What the work changed against what this section planned is recorded
under [Phase 0 outcome](#phase-0-outcome) below.

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

## Phase 0 outcome

All of the above holds. Three things went differently from the plan, and one
piece of work the plan did not anticipate turned out to be the bulk of it.

**The gate lists what it protects, rather than protecting everything.** The
plan said "redirect anything that is not public". Built that way, an unknown
URL answers `302` instead of `404`, which hides every genuine miss — a
`theme-toggle` test that pins a removed asset path at `404` caught it.
`requireApprovedSession` now matches `PROTECTED_PATH_PREFIXES`, and
`require-approved-session.test.ts` pins both halves so a route added later
cannot quietly default to public without the listing test noticing.

**Signed-out visitors go to the intro page, not to `routes.auth.login`.** The
OAuth flow has no return-to, so a bounce to GitHub lands them on the intro page
anyway — one off-site round trip later, having lost the URL they asked for.

**Pending-approval sessions lost their ephemeral store, by design.** They
previously shared guest state, which is how "portfolio is not saved to GitHub
yet" worked: rows lived in the session. With guest state gone they read and
write nothing until approved, and the copy in both locales now says so
(`portfolio.pendingNotSaved`, `guidelines.subtitle.pending`). Writes they
should not be able to reach answer `errors.*.requiresApproval` in all three
response shapes rather than redirecting silently.

**The unplanned work: a gist double that can write.** Route tests exercised
add, sell, import and delete flows *through guest state*. Signed in, those
paths go to `saveEtfs` / `saveGuidelines`, which called GitHub for real — so
removing guest mode broke every mutation test at once, not just the guest
ones. `private-gist-fetch-test-overlay.ts` (read-only) therefore became
`private-gist-test-store.ts`, an in-memory double that serves reads *and*
absorbs writes. Phase 1 needs the same seam for the storage port, so this is
groundwork rather than a detour.

Shared sign-in helpers now live in `test-session-fetch.ts`
(`approvedSessionCookie`, `pendingSessionCookie`, `seedTestSessionCookie`),
replacing the sign-in block each suite had copied. They are deliberately
**additive** — they add a login to `APPROVED_GITHUB_LOGINS` and install a store
only when none exists — because `browser-test.ts` calls them for every page it
opens, and a suite that approved its own login or seeded its own rows first
must not have either wiped out from under it.

**The browser suites needed the same gate treatment, and one of them was
lying.** `openPage` now signs its context in (`signInBrowserContext`, exported
for tests that build a context by hand, such as the no-JS one). Without it
`pages.browser.ts` still **passed**: `page.goto` follows redirects, so all five
pages answered `200` — from the intro page, five times over. It now pins
`page.url()` against the path it asked for. Two suites also needed a per-test
`setPrivateGistTestStore` reset: every context shares one signed-in session and
therefore one store, where guest state used to isolate them per cookie.

**Known leftover:** `adviceGistGateProps` in `app/features/advice/index.ts`
still has a `'sign_in'` branch for `layoutSession === null`, which the gate now
makes unreachable on `/advice`, along with the `advice.requiresGist.*` copy it
renders. Left in place as defence in depth rather than unpicked from the
`withAdviceGate` plumbing mid-phase; worth removing on the next change to that
file.

---

# Phases 1–6 — the storage migration

Each phase ships green on its own.

### Phase 1 — extract the storage port, still on gists ✅

**Done.** There were **four copies of `githubHeaders`** (`app/lib/gist.ts`,
`app/lib/guidelines.ts`, `app/features/advice/advice-gist.ts`,
`app/features/catalog/lib.ts`) and four near-identical `GistPayload` shapes.
Per the pattern-capture rule in `AGENTS.md`, that repetition is now collapsed
into `app/lib/store/github-store.ts`, and all four modules delegate their real
HTTP calls to it. Every exported function signature in those four modules is
unchanged — the ~40 call sites across `app/` and `mcp/` needed zero edits.

**The actual shape differs from this section's original sketch**, once reading
every call site made the requirements concrete:

```ts
// app/lib/store/github-store.ts
type StoredFile = { content: string; version: string | null }

readFile({ token, location, path })       // token: null reads anonymously
readFiles({ token, location, paths })     // one round trip for several paths
writeFile({ token, location, path, content, expectedVersion? })   // content: null deletes
writeFiles({ token, location, files, expectedVersion? })          // atomic multi-file write
```

- **`content: string`, not a parsed `value: T`.** `advice-gist.ts`'s outcome
  read needs to know whether a file had *any* raw content, separately from
  whether that content parsed — collapsing that into "parsed value or null"
  would have lost the distinction between "not found" and "malformed" it
  reports today. Parsing, schema validation and normalization stay exactly
  where they were, in each domain module.
- **`readFiles` (plural) exists because one caller needs it.**
  `fetchStoredAdviceAnalysisOutcomeForTab` reads a mode-specific file with a
  fallback to a legacy shared one, and did that as **one** GET today. Modeling
  the port as single-path-only would have silently doubled that call's GitHub
  API cost. `readFile` is `readFiles` with one path.
- **`token: string | null`, not always required.** The shared catalog reads
  anonymously today (problem #4) — Phase 1 doesn't fix that, so the port has
  to carry the anonymous case rather than force every caller to authenticate.
- **A rejected `writeFiles` carries the raw `Response`.** `saveEtfs` read the
  failure body for extra error-message detail before this module existed;
  dropping that would have been a real, if small, regression. Every other
  caller ignores it and just checks `status`.
- **Every request shares one 5-second timeout**, previously applied only to
  catalog's calls (`gist.ts`/`guidelines.ts`/`advice-gist.ts` had none). This
  is the one deliberate behavior change in this phase: a hung request used to
  hang the page render; now it aborts. Flagged rather than hidden inside
  "pure refactor."
- **Truncated-content handling moved into the port entirely** — every reader
  benefits, not just the catalog. `readFullGistFileContent` is gone from
  `catalog/lib.ts`.

`version` is `null` from every read, and `expectedVersion` is accepted but
unenforced on every write, exactly as planned — no caller relies on it yet.

**Left alone, on purpose:** three separate test-double mechanisms still exist
for "this call is a test, don't hit GitHub" — `private-gist-test-store.ts`
(shared by `gist.ts`/`guidelines.ts`), `advice-gist.ts`'s own `gistTestState`,
and catalog's `sharedCatalogTestSnapshot`. Unifying them touches
`advice.test.ts`/`advice.browser.ts` directly and was judged separate work
from the transport extraction; noted here rather than done by accident.
`app/lib/portfolio-review-gist.ts` was checked and confirmed to have **no**
network calls left (only its own test imports it) — out of scope, and a
candidate for deletion in an unrelated cleanup.

New direct coverage: `app/lib/store/github-store.test.ts` (16 cases) for the
port itself, and 5 new cases in `app/features/advice/advice-gist.test.ts` for
`saveStoredAdviceAnalysisForTab`/the three clear functions — their real-network
paths had **no** prior coverage at all (every existing test in that file ran
through `gistTestState.enabled`); this phase's rewrite would otherwise have
shipped unverified.

Tests stay green: 684/684 unit (was 662; +16 port, +5 advice-gist, +1 net from
a Phase-0-era duplicate removed earlier), 40/40 browser. **This was worth
landing as its own PR** — it is a pure internal refactor with no behavior
surface for Phase 2+ to depend on yet.

**Code review round, once CI was green, found five real issues and one worth
disclosing rather than fixing** — all in `app/lib/store/github-store.ts` unless
noted:

- **The truncation-fallback contract genuinely diverged**, and the obvious fix
  was the wrong one. Catalog's old code fell through to `raw_url` whenever a
  present file's content was `null`, even without `truncated: true` — the
  other three modules never had that check and always treated null/missing
  content as empty. The first fix attempt (restore catalog's exact old branch)
  broke a passing test pinning the other three modules' behavior. Kept the
  safer unified contract instead (null content never triggers a `raw_url`
  attempt) and documented it as a deliberate normalization, with a test
  proving each direction.
- `readFiles` downloaded more than one truncated file's `raw_url` content in
  sequence rather than in parallel — a latency regression specifically for the
  two-file legacy-fallback read this phase introduced. Fixed with
  `Promise.all`; the added test fails against the sequential version (checked
  by temporarily reverting it).
- `buildAdviceAnalysisGistPatchForFile` (`advice-gist.ts`) ended up fully dead
  — no caller, no test — once the save path moved to
  `buildAdviceAnalysisPayload` + `writeFile`. Deleted.
- `buildGuidelinesGistPatch`/`buildCatalogGistPatch` were still independently
  tested but no longer exercised by the real save path, which had started
  building its PATCH content inline instead — meaning their tests no longer
  said anything about production behavior. Routed both save functions back
  through the build-patch functions rather than duplicating the
  `JSON.stringify`.
- Catalog's local `GistFile`/`GistPayload` types still carried `truncated`/
  `raw_url`/`owner`, vestigial now that the port resolves those upstream.
  Trimmed to the same minimal shape `gist.ts`/`guidelines.ts` use — **not**
  unified into one shared type across all three, since their minimal
  "resolved content" shape is a genuinely different concept from the port's
  raw-wire type, not an accidental duplicate of it.
- **Disclosed, not fixed:** `saveEtfs`'s PATCH body now sends `files` only.
  The old code sent `buildGistBody(entries)` — `description` + `public` +
  `files` — re-asserting a fixed description and `public: false` on every
  save. Restoring that would mean leaking a gist-only concept into the port's
  write signature, which a repository backend has no equivalent for. The
  observable effect is identical unless a user changed the gist's description
  or visibility from GitHub's own UI, in which case the new code no longer
  overwrites that on the next save — flagged rather than silently dropped,
  since "no behaviour change" was this phase's own stated bar.

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
