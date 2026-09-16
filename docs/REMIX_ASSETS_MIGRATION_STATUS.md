# Remix assets migration — working status

**Read this first when picking the migration back up.** It holds only *where we
are* and *what is next*. Every finding, measurement and decision rationale lives
in `docs/REMIX_ASSETS_MIGRATION_PLAN.md`; this file points at it rather than
repeating it, so the two cannot drift.

Update this file in the same commit as the work it describes. A commit cannot
contain its own hash, so leave the newest row's hash as `(pending)` and fill it
in with the next commit — an amend or rebase silently invalidates one written
ahead of time.

---

## Starting a session on this migration

1. Read *Where we are* and *Next step* below.
2. Read the Plan's **Validation already performed** section — it is the measured
   basis for every stage, including the one blocker that breaks pages silently.
3. Pick up at *Next step*. Stages 1–2 are per-entry, so taking a single entry is
   a legitimate session; do not feel obliged to finish a whole stage.
4. Land green (`npm run check && npm run typecheck && npm test`, plus
   `npm run test:browser` when the change is client-side), update this file in the
   same commit, and push.

## Where we are

- **Stage:** nothing started. The RC migration (Stages 1–7,
  `docs/REMIX_RC_MIGRATION_PLAN.md`) is complete and merged; this is the
  follow-up it recorded, now scoped into its own plan.
- **Branch:** none yet. Start from `main`.
- **Green:** `npm run check`, `npm run typecheck`, `npm test` (590) and
  `npm run test:browser` (40) all pass on `main`.
- **Working style:** small steps, same as the RC migration. One entry or one
  concern per commit, each landing green, each with browser coverage where the
  change is client-side.
- **Spike status:** a throwaway spike proved the whole path end to end and was
  reverted (see the Plan's *Validation already performed*). Nothing from it is in
  the repo — Stage 0 re-creates its useful half deliberately, with tests.

## Done on this migration, most recent first

| Commit | What |
|---|---|
| — | Nothing yet. |

## Next step

**Stage 0 — unblock client-entry resolution.** Three edits, no behavior change:

- `app/lib/remix-assets.ts`: add `allowFiles` covering what `appStatic`'s filter
  covers today (`app/**/*.component.js`, `app/entry.js`, and the three
  `app/lib/*.js` client files).
- `app/router.ts`: `render({ assets: remixAssetServer })` instead of `render()`.
- `app/components/render.ts`: mirror the middleware's `resolveClientEntry` into
  the direct-`renderToStream` branch, so the five pages that pass a per-call
  `resolveFrame` resolve client entries the same way every other page does.

It is inert until an entry migrates — every entry id is still a literal path and
takes the pass-through branch — which is exactly why it ships on its own. Then
**Stage 1** adds the `file://` guard test (write it first, confirm it fails
without the above) and migrates the first entry.

## Backlog after that, in order

1. **Stage 2** — the remaining 14 entries, splittable by area: layout/navigation
   (3), catalog (4), guidelines (3), portfolio (2), advice (2).
2. **Stage 3** — retire `browserModulePaths`/`remixUiImportMap`, resolve
   `entry.js` through the asset server, narrow or drop `appStatic`.
3. **Stage 4** — browser-side HMR (`hmr` channel + `uiHmr()` loader + the dev-only
   `watch` branch).
4. **Stage 5** — production asset hardening (`fingerprint`, `minify`, `target`,
   `sourceMaps`), each decided on measurement.
5. **Stage 6** — `remix.json`, the `remix` CLI (`assets`, `doctor`, `routes`), and
   re-measuring the reason-3 carve-outs this may unblock.

## Decisions already taken — do not relitigate

- **Migration is incremental, not big-bang.** `resolveClientEntry` branches per
  entry on the `file:` prefix, so migrated and unmigrated entries coexist.
  Measured live with 1 of 15 switched. Plan §*Validation already performed*.
- **Stage 0 must precede any entry migration.** The five pages that bypass
  `context.render()` for a per-call `resolveFrame` otherwise emit a raw `file://`
  absolute server path into public HTML and lose hydration entirely on those
  pages — measured in Chromium (`Not allowed to load local resource`), and
  measured fixed. This is the single highest-severity finding in the plan.
- **`remix/multiple-import-maps-polyfill` is not needed for initial page load.**
  The renderer merges the app's flat import map with the asset server's generated
  scopes into one `<script type="importmap">`. Measured. The question stays open
  only for Stage 4's runtime HMR-added maps.
- **Browser HMR works, and its value depends on Stage 2.** Measured: tab
  preserved, DOM patched, `[remix] HMR accepted update`. Unmigrated entries
  neither reload nor patch — an open tab goes stale — so Stage 4 belongs after
  Stage 2, not before.
- **`button`/`input` stay hand-rolled.** Unrelated to this migration and already
  settled — `docs/REMIX_RC_MIGRATION_PLAN.md` Open question 2, revisit only if
  Remix ships `button/primitives` / `input/primitives`.
