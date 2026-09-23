#!/usr/bin/env python3
"""Summarize JSONL agent episode traces for adaptive-learning decisions.

Usage:
    python trace_digest.py <episodes.jsonl> [--top 8]

Each line should be a JSON object. Missing fields are tolerated.
Recognized fields (all optional except that a line must be JSON):
    episode_id, timestamp, task_type, outcome, reward,
    user_feedback, safety_flags, policy_version,
    actions (list of {tool, name, error, ok, latency_ms})
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from typing import Any


def _load_jsonl(path: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with open(path, encoding="utf-8") as handle:
        for line_no, raw in enumerate(handle, 1):
            text = raw.strip()
            if not text:
                continue
            try:
                obj = json.loads(text)
            except json.JSONDecodeError as exc:
                print(f"[warn] skip line {line_no}: {exc}", file=sys.stderr)
                continue
            if isinstance(obj, dict):
                rows.append(obj)
            else:
                print(f"[warn] skip line {line_no}: not an object", file=sys.stderr)
    return rows


def _outcome(row: dict[str, Any]) -> str:
    value = row.get("outcome")
    if value in {"success", "fail", "partial", "unknown"}:
        return str(value)
    if row.get("reward") is not None:
        try:
            return "success" if float(row["reward"]) > 0 else "fail"
        except (TypeError, ValueError):
            pass
    return "unknown"


def _tools(row: dict[str, Any]) -> list[str]:
    actions = row.get("actions") or row.get("tool_calls") or []
    names: list[str] = []
    if not isinstance(actions, list):
        return names
    for action in actions:
        if isinstance(action, str):
            names.append(action)
            continue
        if not isinstance(action, dict):
            continue
        name = action.get("tool") or action.get("name") or action.get("tool_name")
        if name:
            names.append(str(name))
    return names


def _tool_errors(row: dict[str, Any]) -> list[str]:
    actions = row.get("actions") or []
    errors: list[str] = []
    if not isinstance(actions, list):
        return errors
    for action in actions:
        if not isinstance(action, dict):
            continue
        err = action.get("error") or action.get("error_type")
        if err:
            errors.append(str(err)[:80])
        elif action.get("ok") is False:
            errors.append("ok=false")
    return errors


def digest(rows: list[dict[str, Any]], top_n: int) -> str:
    n = len(rows)
    if n == 0:
        return "No episodes loaded."

    outcomes = Counter(_outcome(r) for r in rows)
    tasks = Counter(str(r.get("task_type") or "unspecified") for r in rows)
    versions = Counter(str(r.get("policy_version") or "unspecified") for r in rows)
    tools = Counter()
    errors = Counter()
    labeled = 0
    with_feedback = 0
    with_safety = 0
    rewards: list[float] = []

    for row in rows:
        if _outcome(row) != "unknown":
            labeled += 1
        if row.get("user_feedback"):
            with_feedback += 1
        flags = row.get("safety_flags") or []
        if flags:
            with_safety += 1
        if row.get("reward") is not None:
            try:
                rewards.append(float(row["reward"]))
            except (TypeError, ValueError):
                pass
        for name in _tools(row):
            tools[name] += 1
        for err in _tool_errors(row):
            errors[err] += 1

    known = outcomes["success"] + outcomes["fail"] + outcomes["partial"]
    success_rate = outcomes["success"] / known if known else float("nan")

    lines = [
        f"episodes: {n}",
        f"labeled outcomes: {labeled} ({labeled / n:.0%})",
        f"outcome counts: {dict(outcomes)}",
        (
            f"success rate among labeled: {success_rate:.2%}"
            if known
            else "success rate among labeled: n/a"
        ),
        f"user_feedback present: {with_feedback}",
        f"episodes with safety_flags: {with_safety}",
    ]
    if rewards:
        lines.append(
            "reward: "
            f"n={len(rewards)} mean={sum(rewards) / len(rewards):.3f} "
            f"min={min(rewards):.3f} max={max(rewards):.3f}"
        )

    lines.append("task_type top:")
    for name, count in tasks.most_common(top_n):
        lines.append(f"  {count:5d}  {name}")

    lines.append("policy_version:")
    for name, count in versions.most_common(top_n):
        lines.append(f"  {count:5d}  {name}")

    if tools:
        lines.append("tools used:")
        for name, count in tools.most_common(top_n):
            lines.append(f"  {count:5d}  {name}")
    if errors:
        lines.append("tool error signatures:")
        for name, count in errors.most_common(top_n):
            lines.append(f"  {count:5d}  {name}")

    task_success: dict[str, Counter[str]] = defaultdict(Counter)
    for row in rows:
        task_success[str(row.get("task_type") or "unspecified")][_outcome(row)] += 1
    lines.append("per-task outcomes:")
    for task_name, counts in sorted(
        task_success.items(), key=lambda kv: -sum(kv[1].values())
    )[:top_n]:
        total = sum(counts.values())
        succ = counts["success"]
        lines.append(
            f"  {task_name}: n={total} success={succ} "
            f"fail={counts['fail']} partial={counts['partial']} "
            f"unknown={counts['unknown']}"
        )

    unlabeled_frac = 1 - (labeled / n)
    lines.append("")
    lines.append("next-step hints:")
    if unlabeled_frac > 0.4:
        lines.append(
            "- label coverage is low; add a checker or human labels before any weight update"
        )
    if errors:
        lines.append(
            "- tool errors are present; start with skill patches + retrieval recipes"
        )
    if tools and outcomes["fail"] > outcomes["success"] and labeled:
        lines.append(
            "- consider a contextual bandit or router; tool choice may be the bottleneck"
        )
    if with_feedback and with_feedback < n * 0.05:
        lines.append(
            "- user_feedback is rare; do not treat thumbs as a dense reward"
        )
    if with_safety:
        lines.append(
            "- quarantine safety_flag episodes from generator training"
        )
    if len(versions) == 1 and "unspecified" in versions:
        lines.append(
            "- policy_version is missing; you cannot attribute regressions later"
        )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("jsonl", help="Path to episode JSONL")
    parser.add_argument("--top", type=int, default=8, help="Rows per ranking")
    args = parser.parse_args()
    rows = _load_jsonl(args.jsonl)
    print(digest(rows, args.top))
    return 0 if rows else 1


if __name__ == "__main__":
    raise SystemExit(main())
