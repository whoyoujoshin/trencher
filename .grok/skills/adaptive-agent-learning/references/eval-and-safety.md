# Evaluation and Safety for Adaptive Agents

No promotion without this protocol. If the user skips eval, say so explicitly and still design the harness.

## Held-out sets

Build three buckets and never train on them:

1. **Gold tasks** — human-written, stable, versioned. Cover core tools and known failure modes.
2. **Canary live slice** — recent real episodes reserved after labeling. Rotate monthly.
3. **Safety suite** — injection into memory, jailbreak-via-tool-output, spend-limit bypass, self-modification requests, PII leakage.

Split by `task_type` and by `policy_version` of the data source so you do not test on the same distribution you just cloned.

## Metrics

Always report the set, not a single vanity number.

Quality:
- task success rate (checker or human)
- repair rate after one correction
- exact-match / rubric score where applicable

Cost and latency:
- tools invoked per success
- tokens and wall time per episode
- dollars per successful task

Learning health:
- label coverage (`known` outcomes / total)
- memory write accept rate vs reject rate
- bandit regret or arm-pull entropy (collapse is a smell)
- % of answers that cited a memory and that memory was judged helpful

Stability:
- gold-set delta vs baseline (absolute and relative)
- forgetting on old task_types
- safety-suite pass rate (must be 100% of critical cases)

## Gates (defaults — tighten if the domain is high-stakes)

Promote an adapter only if all hold vs the frozen baseline:

- gold success >= baseline - 1 percentage point (or agreed delta)
- no new critical safety failure
- p95 latency <= 1.15x baseline unless the user budgeted more
- cost per success <= 1.20x baseline unless quality gain is large and named
- rollback artifact exists and was smoke-tested

If any gate fails, keep the adapter in shadow mode (log what it *would* have done).

## Offline evaluation for bandits and logged policies

- Use IPS / SNIPS / DR only when propensities were logged.
- Clip propensities. Report effective sample size. If ESS is tiny, do not trust the number.
- Simulate the new policy on logged data before any canary.

## Continual-learning failure modes

Watch for these in the digest and eval:

- **Catastrophic forgetting** — old task_type success drops after a new-type update. Mitigate with replay of gold + stratified BC mix.
- **Reward hacking** — policy short-circuits the checker (empty tools, always-agree, marker strings). Mitigate with hidden checks and a diversity penalty.
- **Memory poisoning** — untrusted tool or web content written as fact. Mitigate with source class + corroboration + TTL.
- **Feedback loops** — policy trained on its own unfiltered traces collapses. Mitigate with baseline replay and a quality floor.
- **Distribution shift** — user mix changes, bandit arms starve. Mitigate with exploration floor per arm.
- **Self-modification** — agent edits skills, safety, or spend limits. Deny by construction. Learning jobs must not have write access to safety config.

## Redaction and retention

Before any dataset leaves the runtime:

- Strip secrets, tokens, raw credentials, private URLs
- Replace unique identifiers when they are not needed for the task
- Drop or hash user content if the user asked for session-local learning
- Record `retention` on every episode (`session`, `workspace`, `none`)

Default recommendation — session or workspace memory. Global learning only from explicitly opted-in, de-identified traces.

## Canary and rollback

1. Shadow — new policy scores, old policy acts.
2. Canary — small % of eligible traffic, safety suite on every canary episode.
3. Promote — flip the version pointer.
4. Rollback — pointer back to previous version directory. No migration script required.

Store `policy_version` on every new episode so you can attribute regressions.

## Self-improving / open-ended agents

If the user asks for an agent that rewrites its own code or skills:

- Fitness = hidden tests + safety suite, never "the agent likes the patch"
- Patches land in a sandbox worktree
- A human or a frozen reviewer must promote
- The safety layer, spend limits, and this promotion process are not editable by the learner
