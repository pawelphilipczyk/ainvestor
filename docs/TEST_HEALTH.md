# Test health: the weekly sweep

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

Auditing all of it in one pass is too big to repeat often, and a run that
tries turns into a shallow skim. So the work is **queued, not re-derived**:
one scheduled session, once a week, sweeps *one area of each backlog*,
records what it finds, and acts on **already-triaged items** — never more
than it can push in a single small PR.

## The routine

One Routine — **"Test health sweep (weekly)"** — does both jobs in a single
run: an overlap sweep against `docs/TEST_OVERLAP_BACKLOG.md` and a gap sweep
against `docs/TEST_GAP_BACKLOG.md`. It used to be two daily Routines; they were
merged to cut token spend (a run's cost is dominated by context re-reads
across turns, not by output size, so fewer/larger runs beat more/smaller
ones) and because a suite this size doesn't need daily attention to improve.

| | |
|---|---|
| Fires | weekly, Wednesdays 22:00 UTC |
| Backlogs | both `docs/TEST_OVERLAP_BACKLOG.md` and `docs/TEST_GAP_BACKLOG.md` in the same run |
| Finds | redundant coverage (overlap) and uncovered flows (gap), each against its own rotation |
| Acts by | at most one overlap action (delete/merge, only if already `approved` from a prior run) **and** at most one gap-filling test, in the same PR |
| Branch | `claude/test-health-sweep-<date>` |

**Why Wednesday 22:00 UTC:** picked from an observed rate-limit reset
timestamp on this account, one hour ahead of it so the run lands just before
the window turns over. That account-level limit is a **rolling window**, not
a fixed weekly calendar slot, so this time is a best-effort proxy, not a
verified anchor — check your usage page on claude.ai and adjust the cron if
it drifts.

Each backlog keeps its own "Next area to sweep" pointer and advances it once
per run, same as before. With one run a week instead of one a day, a full
8-area cycle now takes **8 weeks** instead of 8 days per backlog — slower,
but this was never meant to be exhaustive on a tight clock, only to keep
moving.

## Bounding the cost of a run

The hunting phase (reading widely across the codebase to find overlap or
gaps) is what drove context up on the old daily runs — tens of thousands of
output tokens cost millions of cache-read tokens because a long agentic loop
re-reads its accumulated context every turn. To keep a weekly run cheap:

- **Do the hunting phase through a subagent per backlog** (the `Agent` tool,
  an `Explore`-type agent if available, otherwise general-purpose): ask it to
  search and report back a written summary with `file:line` evidence, rather
  than pulling every candidate file into the main session's context. Two
  subagents (one per backlog), each returning a short report, keep the main
  session's own context to the write phase: appending to the backlogs,
  making the one or two file edits, running checks, and shipping.
- Keep the search scoped to the one area each backlog's rotation names —
  never widen a hunt to "look around a bit more" once that area is covered.

## What one run is allowed to do

Each run produces **exactly one pull request**, small enough to review in a
few minutes:

1. **Sweep one area per backlog** (the next one in each rotation below), and
   append what's found to that backlog as `proposed` items, with evidence.
2. **Act on already-approved items only** — up to one overlap action and one
   gap-filling test, never anything proposed in this same run.
3. **Open one PR** with both backlog updates plus those changes, and stop.

Hard limits, so the loop never runs away:

- One PR per run. Never more.
- At most one overlap action and one gap-filling test per run — two file
  changes at the very most, never more.
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
- **Verify the push landed before claiming anything.** `git ls-remote
  --heads origin <branch>` must print a sha. A run that skips this and
  reports success on an unpushed branch is the one failure mode that has
  actually happened here — see the note below.

## Area rotation

Each backlog tracks its own pointer into this list, advanced once per week
by the same run.

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
  what stops the loop rediscovering the same non-issue every cycle.
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

Every run opens exactly one PR, and its body states: which area of each
backlog was swept, what was proposed, what was acted on, and why. A run that
finds nothing worth proposing and has nothing `approved` to act on still
opens a PR — it advances both rotation pointers and says both areas came back
clean. That PR is a small diff and a receipt that the sweep ran; merge it and
move on. **A quiet week is a valid result, and padding either backlog to
avoid one is worse than the quiet week.**

Each PR follows the repo's template (`.github/pull_request_template.md`) and is
titled `test-sweep(weekly): <overlap area> + <gap area> — <what it did>`.

## The Routine itself

Lives in the account's Claude Routines list (claude.ai/code/routines), fires a
**fresh session per run** with the repo attached as a source, and carries the
whole job description in its prompt — nothing about it lives in this repo
except this doc and the two backlogs.

| | Trigger ID |
|---|---|
| Test health sweep (weekly) | `trig_01G6iJP7rCLqdPa2Y5QcDYeY` |

**Push notifications are on**, email off, so each run reaches your phone with a
one-line summary — areas swept, what was proposed, what it did, PR link.
Change either channel in the Routines UI. (The notification setting is fixed
when a Routine is created; editing it afterwards is a UI-only operation.)

A run always pushes its branch and verifies the push with `git ls-remote`
before trying to open the PR. If the push never lands, the run says
**"NOTHING PUSHED"** first in its summary and prints the diff it produced, so
nothing is silently lost — this happened once, on 2026-09-16, before the
Routine had a repository source attached at all; see git history on this file
for the incident.

### History

- **2026-09-16, morning**: two daily Routines created (overlap 21:00, gap
  22:00 Europe/Warsaw), no repository or connectors attached. Both fired that
  evening, ran 8–9 minutes each, burned real context, and pushed nothing —
  the fired sessions had no git remote to push to. Both disabled.
- **2026-09-16, evening**: repository and connectors attached to both
  Routines by the user. Prompts updated to verify pushes with `git
  ls-remote` rather than assume they land, and to report "NOTHING PUSHED"
  loudly if they don't.
- **2026-09-16, night**: combined into one weekly Routine per the cost
  analysis above, and rescheduled off a daily cadence.
