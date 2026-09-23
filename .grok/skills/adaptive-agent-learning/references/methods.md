# Adaptation Methods for Tool-Using Agents

Pick the cheapest method that can move the named metric. Combine at most two at once (example: retrieval + bandit). More than two update surfaces makes attribution impossible.

## 1. Episodic memory and retrieval

**Use when:** recurring facts, user preferences, tool-failure recipes, project conventions.

**Write policy (required):**
- Source class — `user_stated`, `user_corrected`, `inferred`, `tool_observed`
- Confidence and corroboration count
- TTL (user facts long, tool observations short)
- Namespace (per-user / per-workspace / global)
- Conflict rule (newest user_stated wins; inferred never overwrites user_stated)

**Do not write:** raw chain-of-thought, secrets, untrusted web text, or failed tool payloads without a distilled lesson.

**Update mechanism:** embed the lesson, store metadata, retrieve top-k with a hard filter on namespace and source class. Optional reranker trained on "was this memory used and helpful."

**Typical lesson format:**
```
situation: <task pattern>
failed_action: <tool + args summary>
error: <normalized error>
repair: <what worked>
applies_when: <preconditions>
```

## 2. Prompt and skill patching

**Use when:** the same mistake appears 3+ times and can be stated as a rule.

**Process:**
1. Cluster failures by error signature or missing step.
2. Write one rule per cluster. Keep the rule testable.
3. Ship as a versioned skill addendum, not an in-place overwrite.
4. A/B the patched skill against the frozen baseline on the cluster plus a regression suite.

**Stop condition:** if rules exceed ~30 and conflict, promote the routing problem to a bandit or a small classifier.

## 3. Contextual bandits for tools, models, and skills

**Use when:** discrete arms (tools, models, skills, search strategies) and a delayed but observable reward.

**Reward design:**
- Primary — task checker (0/1 or bounded scalar)
- Penalties — cost, latency, safety flag, user revert
- Clip and normalize. Never use raw token spend as the only reward.

**Features (keep short and stable):**
- task embedding or hashed task_type
- predicted complexity
- historical arm success in this task_type
- remaining budget
- time of day / load only if it actually changes quality

**Algorithms:** LinUCB or Thompson sampling on a linear / small neural value head. Mask illegal arms with a hard safety filter *before* sampling.

**Exploration:** decay toward greedy only after a minimum pull count per arm *and* per context bucket. Log propensity scores if you will later do offline eval.

## 4. Outcome and preference models (critics)

**Use when:** you can score candidate plans or final answers cheaper than executing them.

**Data:**
- Outcome model — episodes with reliable `outcome` / `reward`
- Preference model — pairwise (A beats B) from humans or from a trusted checker

**Training notes:**
- Start with a small cross-encoder or a prompted judge *only* if the judge is calibrated on a labeled slice.
- Calibrate with temperature scaling or isotonic regression on held-out labels.
- Predict both score and uncertainty. High-uncertainty cases go to the baseline policy or a human.

**Use the critic to:** rank candidate tool plans, reject low-score completions, or provide a reward for offline policy updates. Do not let an uncalibrated judge be the only gate.

## 5. Offline policy improvement

**Use when:** you have thousands of labeled episodes and cannot train online safely.

**Options, safest first:**
- Filtered behavior cloning — clone only episodes above a reward quantile, stratified by task_type
- Conservative Q-learning / IQL-style updates — penalize OOD actions
- Rejection sampling / best-of-n at inference using the critic (no weight change)

**Logging requirement:** must have the policy version and, for bandits, propensities. Without them, off-policy estimates lie.

## 6. Parameter updates (LoRA, continued train, RL)

**Use when:** non-parametric methods plateau *and* you have
- a data contract
- a frozen eval suite
- compute and a rollback artifact

**Data mix (starting point, adjust with eval):**
- 50% high-reward filtered traces
- 30% preference pairs / repairs
- 20% general instruction data to limit forgetting

**Recipe defaults:**
- LoRA / QLoRA on attention and MLP projections
- Short context samples first (single-step tools), then multi-step traces
- KL or replay constraint against the baseline
- Early-stop on safety + held-out, not on training loss

**Online RL (PPO, GRPO, RLOO, etc.):**
- Only in a sandbox or canary with rate limits
- Reward model must be isolated from the policy that is being optimized
- Freeze safety / refusal behavior with a separate constrained head or a post-filter that learning cannot disable

## Method selection cheatsheet

| Signal volume | Signal quality | Change surface | First choice |
| --- | --- | --- | --- |
| tens | user corrections | memory / skill | retrieval + patch |
| hundreds | tool success/fail | tool choice | contextual bandit |
| hundreds | pairwise prefs | answers | preference critic + rerank |
| thousands+ | reliable checker | generator | filtered BC or LoRA |
| streaming live | noisy | any | memory + bandit, not weights |

## Module sketch (keep these separate)

```
agent/
  executor.py      # tools, no learning writes
  policy.py        # frozen baseline + adapter hook
  memory/
    store.py       # namespaced retrieval
    writer.py      # write policy, redaction
  router/
    bandit.py      # arm selection + propensities
  critic/
    outcome.py
  learn/
    dataset.py     # JSONL -> filtered rows
    update.py      # versioned promotions
    eval.py
```

Learning jobs read traces and write a *new* version directory. The executor only reads the currently promoted version.
