# Trencher mapping

This repo already learns. Do not invent a second memory. Wire the adaptive loop onto the surfaces that exist.

## Agents and who may learn

| Agent | May change | Must not change |
| --- | --- | --- |
| SCOUT | tape features only | size, buy, playbook |
| WARDEN | veto + kill grade after `GRADE_AFTER_MS` | entries, knobs, spirit write policy |
| SNIPER | entries inside cap and exit | averaging, opening without an exit |
| RISK | stop/take after a sample | easing a stop on one clip |
| TILL | fees, gate, survival | trades |
| META | thesis, keywords, drop, weather knobs, word tape, scorecard | Warden rules, spirit write policy, hot-wallet secrets |

META line in `src/lib/trench/types.ts` is locked — "Never rewrites Warden or spirit."

## Existing policy surfaces (use these)

Non-parametric memory:
- `Lesson` — distilled rule, capped, owned by an agent
- `KillRecord` + `KillGrade` (`pending` / `rugged` / `ran` / `flat`) — labeled only after grade
- `SpiritCanon` in `src/lib/trench/canon.ts` — merge of seated books
- `BookFile` (`kind=trencher-book`) — portable generation

Routers / knobs:
- `Playbook` — scoreFloor, stopPct, takePct, socialBias, bannedCreators
- `MetaState` — thesis, keywords, drop, source (`open` / `local` / `grok`)
- `MetaScorecard` — `bySource`, `byThesis`, `byKeyword`
- `WordStat` — token counts with PnL
- `Weather` — temporary tape response, not a permanent rewrite

Signal:
- `ClosedTrade.pnlUsd` / `pnlPct` / `reason` after the position is closed
- `Rival` paper vs Hatch live — never mix unlabeled paper PnL into live sizing
- User seating a book into spirit (`useSpirit.seat` / `absorb`)

## Default loop for this desk

1. Episode = one closed trade or one graded kill, not a scan line.
2. Label from `KillGrade` or closed PnL. `pending` stays out of training.
3. Write a `Lesson` if the same failure repeats 3+ times. Version the lesson text; do not overwrite in place.
4. Update `keywords` / `drop` / `bannedCreators` from corroborated lessons.
5. Update `MetaScorecard` and `WordStat` as the bandit / router.
6. Change `Playbook` knobs only after a stratified sample (paper and live separate).
7. Weather may twitch bar/size/sitMs. Playbook changes survive the clone. Weather does not become canon until RISK + a sample agree.

## Files to touch

- Types — `src/lib/trench/types.ts`
- Merge / seed — `src/lib/trench/canon.ts`, `src/lib/trench/spirit.ts`
- Desk brain — `src/lib/trench/logic.ts`, `src/lib/trench/store.ts`
- UI — `src/components/trench/spirit-box.tsx`, `terminal.tsx`

Do not put hot-wallet secrets, private keys, or Hatch live key material into lessons, books, or this skill.

## Promotion gates on this desk

Ship a knob / keyword / lesson change only if:
- paper tape does not regress vs the frozen playbook on the last closed sample
- live Hatch sizing stays inside `MAX_BUY_SOL` and existing stops
- Warden can still veto
- a previous `BookFile` can be seated to roll back

No LoRA, no gradient step, no agent self-edit of Warden or Till.
