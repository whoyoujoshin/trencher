# TRENCHER project instructions

Private paper gulag + Hatch live desk. Follow `AGENTS.md` for App Builder plumbing. This file is the product contract.

## What this app is

Six agents on one desk — SCOUT, WARDEN, SNIPER, RISK, TILL, META — scanning Pump.fun and Robinhood/Pons tape, paper by default, Hatch live only from keys that stay in the hunter tab.

Never commit a hot-wallet secret. Never log a private key. Never put live key material in `BookFile`, lessons, or spirit canon.

## Skills to open first

- Adaptive learning, META weather, spirit canon, lessons, kills, playbook knobs, scorecards, "make it learn" → **`.grok/skills/adaptive-agent-learning/SKILL.md`** and `references/trencher.md`.
- Do not invent a second memory store. The learning surfaces already exist in `src/lib/trench/{types,canon,spirit,logic,store}.ts`.

## Locked agent rules

- META may change thesis, keywords, drop, weather knobs, word tape, and the scorecard.
- META must not rewrite Warden veto logic or spirit write policy.
- RISK eases a stop only on a sample, never on one clip.
- SNIPER never averages and never enters without an exit.
- Warden grades kills after `GRADE_AFTER_MS`. `grade=pending` is not a label.
- Hunt wallet play bank is $50 of native (SOL on pump, ETH on Robinhood/Pons). Till reserves anything over that in the same wallet and does not send it. HOT may spend only the $50 play bank; buys do not refill that bank from the reserve. Paper and Hatch stay on separate tapes. Clip caps (`LIVE_CAP_SOL` / `LIVE_CAP_ETH`) are not this ceiling.

## When changing learning behavior

1. Treat a closed trade or a graded kill as the episode.
2. Prefer a new `Lesson` + keyword/drop patch over a playbook rewrite.
3. Keep paper PnL and Hatch live PnL on separate tapes.
4. Version playbook changes so a seated book can roll them back.
5. Leave wallet, RPC, and fee code alone unless the ask is explicitly about those.
