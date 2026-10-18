# Future improvements

Ideas left out on purpose. None is needed for the app to work. Remove an item
when it is done. (AI Shopper keeps the same file, `docs/FUTURE_IMPROVEMENTS.md`.)
Missing or redundant tests have their own queues, `docs/TEST_GAP_BACKLOG.md`
and `docs/TEST_OVERLAP_BACKLOG.md`.

## Take the OpenAI model from a secret, like AI Shopper

**Today:** the models are a list in code (`ADVICE_MODEL_IDS` in
`app/features/advice/advice-openai.ts`). The advice form, the `generate_advice`
MCP tool and the catalog page all check a model against that list and refuse
any other. A new OpenAI model means a code change and a PR (as `gpt-6.1-sol`
did, #255).

**Idea:** like [AI Shopper](https://github.com/pawelphilipczyk/aishopper)
(`docs/IN_APP_EVALUATION.md` there), read the model name as plain text from a
Fly secret and know no model by name in the code:

- `OPENAI_MODEL` for the advice (default stays `gpt-5.6-terra` when unset).
- `OPENAI_CATALOG_MODEL` for the catalog fund write-ups (default stays
  `gpt-5.6-luna`).
- A new OpenAI model then works after `fly secrets set`, with no PR and no
  deploy of new code (the machine only restarts). The model must take what the
  prompt sends (text and a JSON answer here).

**What it costs:**

- The model choice in the advice form goes away (today Sol, Terra or Luna per
  advice), and so does the `model` argument of `generate_advice`. One model for
  everyone, set in the secret.
- Middle way, if per-advice choice is worth keeping: keep the list, and let the
  secret only replace the *default*. A new model still has to be added to the
  list to be pickable by hand.

**Why not now:** the list works, new models are rare, and one small PR now and
then is cheaper than reworking how the model is chosen. Revisit if we want the
same way of working in both apps.

## Report app errors, like AI Shopper

**Today:** a server error is a `console.error` (23 of them across `app/` and
`mcp/`) and is gone when the machine restarts; the only way to read it is
`fly logs`. Script errors on the web page are not reported at all.

**Idea:** what [AI Shopper](https://github.com/pawelphilipczyk/aishopper) has
(`app/features/errors/`, `app/lib/error-log.ts`, `docs/MCP.md` there):

- One `recordError(where, error)` helper that logs and also keeps the error,
  so the 23 `console.error` calls become one call each.
- Each distinct error kept once with a count, the build and the place; only the
  latest few hundred are kept, so a loop of failures cannot fill the disk.
- Script errors from the web page sent to a `POST /errors` route, with the
  browser's text treated as untrusted.
- A `list_errors` MCP tool, offered only to the maintainer's logins, so Claude
  can read what went wrong without `fly logs`.

**What stands in the way:** AI Shopper keeps the errors in the same SQLite file
as its data, on a Fly volume. AInvestor has no volume and keeps its data in the
user's GitHub repository, so the log needs a home first. Options: a small Fly
volume with SQLite just for the log (a fixed cost, and a machine tied to one
volume), or the log in the shared data repo (rate limits, and errors in a place
other people can read). Decide that before building.

**Why not now:** `fly logs` is enough while the app has one maintainer. Revisit
when an error is found only by a user telling us about it.
