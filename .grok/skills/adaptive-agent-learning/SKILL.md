---
name: adaptive-agent-learning
description: Design and implement adaptive learning loops for tool-using agents using machine learning — continual and online learning, feedback from traces, memory and retrieval updates, contextual bandits, preference learning, evaluation, and safety. Trigger on adaptive learning, self-improving agents, online learning, continual learning, learning from feedback, agent traces, policy update, experience replay, Trencher META, spirit canon, lessons, or kill grades.
metadata:
  type: workflow
  version: "1.0"
---

# Adaptive Agent Learning

Act as the specialist for making tool-using agents improve from experience without assuming a full training cluster. Prefer cheap, reversible, measurable updates over opaque fine-tunes.

## What This Skill Encodes

The model already knows generic ML. Use this skill for the agent-specific loop — how traces become labeled experience, which update mechanism to pick, how to evaluate without leaking test tasks, and how to keep safety invariants while the policy changes.

Load `references/methods.md` when choosing an update mechanism.
Load `references/eval-and-safety.md` before recommending any write-back to memory, prompts, or weights.
Load `references/trencher.md` when the workspace is `whoyoujoshin/trencher` or the task touches META, spirit, lessons, kills, playbook knobs, or weather.
Use `scripts/trace_digest.py` to summarize JSONL episode traces into a learning report.

## Default Stance

1. Treat every conversation, tool call, and user correction as a potential episode — not as training data until it is labeled and filtered.
2. Prefer **non-parametric** updates first (memory, retrieval, prompts, routers). Move to parameter updates only when those saturate.
3. Never update from unlabeled success. A completed tool call is not a reward.
4. Keep a frozen baseline policy. Adaptive layers sit on top so you can roll back.
5. Measure before and after on a held-out task set. No metric, no ship.

## Decision Tree (pick one primary mechanism)

Use this order unless the user already specified a method:

1. **Episodic memory + retrieval** — user corrections, durable facts, tool-failure recipes. Fastest, safest, cheapest.
2. **Prompt / skill patching** — recurring failure modes that can be written as rules. Version the skill or system addendum.
3. **Contextual bandit / router** — choosing among tools, models, or skills given a context vector.
4. **Preference or outcome model** — pairwise rankings or scalar task success to score candidate actions.
5. **Offline policy improvement** — filtered behavior cloning or conservative Q-learning on logged traces.
6. **Parameter update (LoRA / continued pretrain / RL)** — only with eval harness, data contract, and rollback.

If the request is "make the agent learn," start at 1-3. Jumping to 6 is an anti-pattern.

## Working Loop

Follow this sequence on every task.

### 1. Scope the adaptation target

Name the *policy surface* that will change:
- retrieval corpus / memory store
- skill or prompt text
- tool-routing weights
- reward / critic model
- generator weights

Name the *signal*:
- explicit user correction or rating
- task success / failure (must define a checker)
- tool error taxonomy
- latency, cost, or safety flags
- human preference pairs

If the signal is missing, design the logger first. Do not invent labels.

### 2. Instrument traces

Require an episode schema. Minimum fields:
- `episode_id`, `timestamp`, `task_type`
- `input`, `plan` (optional), `actions[]` with tool name, args, result, latency
- `outcome` (`success` | `fail` | `partial` | `unknown`)
- `reward` (null unless a checker or human produced it)
- `user_feedback` (free text + optional rating)
- `safety_flags[]`
- `policy_version`

Store as JSONL. One episode per line. Redact secrets before any learning step.

If the user has logs, run:

```bash
python .grok/skills/adaptive-agent-learning/scripts/trace_digest.py <path-to.jsonl>
```

Use the digest to find top failure modes, tool error rates, and unlabeled volume.

### 3. Label and filter

- Drop `outcome=unknown` from training unless a human or checker labels them.
- Split by `task_type` so a high-volume easy task cannot dominate.
- Deduplicate near-identical prompts.
- Quarantine episodes with `safety_flags` — they may train a critic, never a generator, unless a human approved the repair.
- Keep a `gold` slice that never trains.

### 4. Choose the update and implement it

Match method to data volume and risk using `references/methods.md`.

Implementation rules:
- Write adapters as separate modules (`memory`, `router`, `critic`, `policy`). Do not bake learning into the tool executor.
- Version every artifact (`memory-vN`, `skill-vN`, `lora-vN`).
- Make updates idempotent and reversible.
- Log *why* an update fired (which episodes, which metric moved).

### 5. Evaluate, then promote

Use the protocol in `references/eval-and-safety.md`.
Promote only if:
- held-out success does not regress beyond the agreed delta
- safety tests stay green
- cost/latency stay inside budget
- a rollback pointer exists

### 6. Report

Structure the response as:
- **Target policy surface** and **signal**
- **Data inventory** (episodes, label coverage, leaks)
- **Chosen mechanism** and why cheaper options were rejected
- **Update plan** (code/module sketch, versioning)
- **Eval harness** (tasks, metrics, gates)
- **Risks** (forgetting, reward hacking, prompt injection into memory)
- **Rollback**

Do not dump generic ML lecture notes.

## Common User Requests and How to Handle Them

- **"Make the agent learn from mistakes"** — instrument traces, cluster failures, write skill patches + retrieval snippets. Offer a bandit only if tool choice is the bottleneck.
- **"Fine-tune the agent"** — demand labeled outcomes and an eval set first. Default to LoRA on a filtered successful-trace mix plus preference pairs, not raw chat dumps.
- **"Add reinforcement learning"** — start with contextual bandits or offline conservative updates. Online RL against live users needs explicit consent, rate limits, and a frozen safety layer.
- **"Long-term memory that improves"** — retrieval with write policies (confidence, corroboration, TTL, user-owned facts vs inferred facts). Never write tool output into memory as truth.
- **"The agent should pick better tools over time"** — contextual bandit with features from task embedding, past tool success, cost, and latency. Epsilon or Thompson exploration with a safety mask.
- **"Self-improving agent / Darwin-Gödel / ASE"** — treat as a research architecture. Keep a sandbox, require tests as the fitness function, and never let the agent edit its own safety layer.

## Design Constraints You Must Enforce

- Adaptation must not silently change safety, refusal, or spend limits.
- User data used for learning needs an explicit retention rule. Default to session-local unless the user says otherwise.
- Do not recommend scraping private logs from other users.
- Do not recommend gradient updates on a single conversation.
- If code is produced, keep learning code separate from inference code.

## When to Ask the User

Ask only if blocking:
- Where do traces live, and in what format?
- What counts as success for this task?
- Is parameter change allowed, or only memory/prompt change?
- Latency and cost budget per request?
- Who owns rollback?

If they cannot answer success, design the checker with them before any learner.

## Anti-patterns

- Fine-tuning on unfiltered chat transcripts
- Storing every tool result as memory
- Using thumbs-up as a dense reward for multi-step tools
- Updating the same prompt in place with no version
- Measuring only training-task accuracy
- Letting the agent rewrite this skill or its safety rules as part of "learning"
- Letting META rewrite Warden veto rules or spirit write policy
- Treating an ungraded kill (`grade=pending`) as a labeled reward
- Raising size or easing a stop from a single clip
