# Test health: the daily sweep

This repo has a large, largely agent-generated test suite. Baseline at the time
this file was written (2026-09-16): **53 test files, ~14,000 lines**, running
**590 cases in 88 suites** under `npm test`, plus **36 browser cases** under
`npm run test:browser` and one gated OpenAI smoke test. All green.

A suite that size drifts in two directions at once:

- **Overlap** — the same behaviour asserted in three places, so a single
  behaviour change breaks three tests and none of them is the one that
  documents the rule.
- **Gaps** — flows nobody ever wrote a test for, usually the unglamorous
  ones: middleware, flash messages, fragment routes, error branches.

Auditing all of it in one pass is too big to repeat daily, and a run that
tries turns into a shallow skim. So the work is **queued, not re-derived**:
two scheduled sessions each sweep *one area per day*, record what they find
in a backlog, and act on **one already-triaged item** per run.

## The two routines

| | Overlap sweep | Gap sweep |
|---|---|---|
| Fires | daily, 21:00 Europe/Warsaw (`0 19 * * *` UTC) | daily, 22:00 Europe/Warsaw (`0 20 * * *` UTC) |
| Backlog | `docs/TEST_OVERLAP_BACKLOG.md` | `docs/TEST_GAP_BACKLOG.md` |
| Finds | redundant, subsumed and duplicated coverage | untested modules, routes, branches and flows |
| Acts by | deleting/merging a redundant test | writing one missing test |
| Branch | `claude/test-overlap-sweep-<date>` | `claude/test-gap-sweep-<date>` |

They are staggered an hour apart on purpose: each owns exactly one backlog
file, and no two runs touch the same file at the same time.

Cron is evaluated in **UTC**, so the local fire time shifts by an hour when
Poland leaves CEST — 21:00/22:00 in summer, 20:00/21:00 in winter. That is
fine for this job; adjust the cron if it ever matters.

## What one run is allowed to do

Each run produces **exactly one pull request**, small enough to review in a
minute:

1. **Sweep one area** (the next one in the rotation below), and append what
   it finds to its backlog as `proposed` items, with evidence.
2. **Act on at most one item** that is already `approved` — never one
   proposed in the same run.
3. **Open a PR** with the backlog update plus that one change, and stop.

Hard limits, so the loop never runs away:

- One PR per run. Never more.
- At most one behavioural test change per run.
- **Never delete a test in the run that proposed deleting it.** A deletion
  needs the item to have been sitting at `proposed` since a previous run —
  that gap is your veto window.
- Never skip, disable, `.skip`, `.only` or quarantine a test to make a suite
  pass. If a test fails, that is a finding, not an obstacle.
- Never touch production code to make a test easier. Test changes only.
  If a test can only be written by changing `app/` or `mcp/` source, log the
  item as `blocked` and say why.
- `npm run check` and `npm test` must pass before the PR opens. Browser
  changes also need `npm run test:browser` (needs
  `npx playwright install chromium` once).

## Area rotation

Each backlog tracks its own pointer into this list, so the two routines
sweep independently. One full cycle takes eight days.

| # | Area | Files | Cases |
|---|---|---|---|
| 1 | `app/features/advice` | 4 + 1 browser + 1 smoke | 72 |
| 2 | `app/features/catalog` | 5 + 2 browser | 84 |
| 3 | `app/features/guidelines` | 1 + 1 browser | 49 |
| 4 | `app/features/portfolio` | 1 + 1 browser | 42 |
| 5 | `app/lib` | 12 | 89 |
| 6 | `app/components` + shared browser layer | 6 + 4 browser | 49 |
| 7 | `mcp` core (`http`, `protocol`, `resources`, oauth, caches) | 8 | 90 |
| 8 | `mcp/tools` | 6 | 116 |

Counts are the baseline from 2026-09-16, kept as a drift signal rather than
a number to maintain — do not bother updating them every run.

## Item lifecycle

Both backlogs use the same statuses:

- **`proposed`** — found and evidenced, not yet actionable. Sits at least one
  run before anything happens to it.
- **`approved`** — eligible to be acted on by a later run. A run promotes its
  own earlier `proposed` items only when the evidence still holds on a
  re-check; you can also promote one by hand.
- **`done`** — applied, with the PR link.
- **`rejected`** — decided against, with a reason. **Runs must read the
  rejected items before proposing, and must never re-propose one.** This is
  what stops the loop rediscovering the same non-issue every eight days.
- **`blocked`** — needs a decision or a production-code change. Says what it
  needs.

## How to steer it

- **Veto a proposed deletion**: change its status to `rejected` and add a
  one-line reason. The next run reads it and moves on permanently.
- **Jump the queue**: set an item to `approved` — runs prefer the oldest
  `approved` item, so promote the one you want next.
- **Pause**: disable the Routine (it stays stored and its history is kept)
  rather than deleting it.
- **Re-point the sweep**: edit the `Next area` line at the top of a backlog.

## Reading the output

Every PR body states: the area swept, what was proposed, what was acted on,
and why that item was chosen. If a run finds nothing worth proposing in its
area, it says so, advances the pointer, and still opens its PR only if it
acted on an `approved` item — otherwise it reports "nothing to do" and
opens nothing. A quiet day is a valid result.
