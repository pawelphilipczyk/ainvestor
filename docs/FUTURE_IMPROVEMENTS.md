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
