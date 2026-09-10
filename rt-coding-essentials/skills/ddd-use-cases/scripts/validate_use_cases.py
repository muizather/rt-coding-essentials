#!/usr/bin/env python3
"""
Validate use-cases.json + process-map.json against domain-model artifacts.

Usage:
  python3 validate_use_cases.py <output_root>
  python3 validate_use_cases.py <output_root> --strict
  python3 validate_use_cases.py <output_root> --context analytics-etl
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

GAP_TYPES = {
    "unclear-actor",
    "unclear-trigger",
    "orphan-command",
    "orphan-event",
    "orphan-inbound",
    "ambiguous-aggregate",
    "missing-outcome",
    "cross-context-orphan",
    "naming-uncertain",
}


def load_json(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def cmd_key(aggregate: str, command: str) -> str:
    return f"{aggregate}::{command}"


def validate_context(
    slug: str,
    ctx_dir: Path,
    errors: list[str],
    warnings: list[str],
) -> None:
    uc_path = ctx_dir / "use-cases.json"
    agg = load_json(ctx_dir / "aggregates.json")
    events_doc = load_json(ctx_dir / "domain-events.json")
    integ = load_json(ctx_dir / "integrations.json")
    uc_doc = load_json(uc_path)

    if uc_doc is None:
        warnings.append(f"{slug}: missing use-cases.json (skip coverage)")
        return

    if uc_doc.get("context_slug") and uc_doc["context_slug"] != slug:
        errors.append(
            f"{slug}: context_slug={uc_doc['context_slug']!r} does not match folder"
        )

    use_cases = uc_doc.get("use_cases") or []
    gaps = uc_doc.get("gaps") or []
    gap_ids = {g.get("id") for g in gaps if g.get("id")}
    open_gaps = [g for g in gaps if g.get("status") == "open"]

    for g in gaps:
        gt = g.get("gap_type")
        if gt and gt not in GAP_TYPES:
            warnings.append(f"{slug}: unknown gap_type {gt!r} on {g.get('id')}")

    # Index domain model
    aggregates: dict[str, Any] = {}
    commands: set[str] = set()
    queries: set[str] = set()
    if agg:
        for a in agg.get("aggregates") or []:
            name = a.get("name") or ""
            if name:
                aggregates[name] = a
            for c in a.get("commands") or []:
                cn = c.get("name")
                if cn:
                    commands.add(cmd_key(name, cn))
            for q in a.get("queries") or []:
                qn = q.get("name")
                if qn:
                    queries.add(cmd_key(name, qn))

    event_names: set[str] = set()
    if events_doc:
        for e in events_doc.get("events") or []:
            if e.get("name"):
                event_names.add(e["name"])
        for e in events_doc.get("integration_events") or []:
            if e.get("name"):
                event_names.add(e["name"])

    inbound_count = len((integ or {}).get("inbound") or [])

    referenced_commands: set[str] = set()
    referenced_queries: set[str] = set()
    emitted_events: set[str] = set()
    reactive_count = 0

    for uc in use_cases:
        uid = uc.get("id") or "<no-id>"
        if not uc.get("id"):
            errors.append(f"{slug}: use case missing id")
        if not uc.get("name"):
            errors.append(f"{slug}: {uid} missing name")
        if uc.get("kind") not in ("command", "query", "reactive", None):
            warnings.append(f"{slug}: {uid} unexpected kind {uc.get('kind')!r}")

        target = uc.get("target_aggregate")
        if target and aggregates and target not in aggregates:
            errors.append(f"{slug}: {uid} target_aggregate {target!r} not in aggregates.json")

        for c in uc.get("commands_invoked") or []:
            if target:
                referenced_commands.add(cmd_key(target, c))
            else:
                # try any aggregate
                matched = [k for k in commands if k.endswith(f"::{c}")]
                if not matched and commands:
                    errors.append(f"{slug}: {uid} command {c!r} not found on any aggregate")
                for m in matched:
                    referenced_commands.add(m)

        for q in uc.get("queries_invoked") or []:
            if target:
                referenced_queries.add(cmd_key(target, q))
            else:
                matched = [k for k in queries if k.endswith(f"::{q}")]
                for m in matched:
                    referenced_queries.add(m)

        outcomes = uc.get("outcomes") or {}
        for ev in outcomes.get("domain_events") or []:
            emitted_events.add(ev)
            if event_names and ev not in event_names:
                warnings.append(
                    f"{slug}: {uid} outcome event {ev!r} not in domain-events.json"
                )
        for ev in outcomes.get("failure_events") or []:
            emitted_events.add(ev)

        if uc.get("kind") == "reactive":
            reactive_count += 1

        actor_status = uc.get("actor_status")
        trigger = uc.get("trigger") or {}
        trigger_type = trigger.get("type")

        if actor_status == "unknown" or uc.get("actor") is None:
            linked = set(uc.get("gaps") or [])
            actor_gaps = [
                g
                for g in gaps
                if g.get("id") in linked and g.get("gap_type") == "unclear-actor"
            ]
            if not actor_gaps:
                # also accept any open unclear-actor gap referencing this uc
                actor_gaps = [
                    g
                    for g in open_gaps
                    if g.get("gap_type") == "unclear-actor"
                    and (g.get("related") or {}).get("use_case_id") == uid
                ]
            if not actor_gaps:
                errors.append(
                    f"{slug}: {uid} has unknown actor but no unclear-actor gap"
                )

        if trigger_type == "unknown":
            linked = set(uc.get("gaps") or [])
            trig_gaps = [
                g
                for g in gaps
                if g.get("id") in linked and g.get("gap_type") == "unclear-trigger"
            ]
            if not trig_gaps:
                trig_gaps = [
                    g
                    for g in open_gaps
                    if g.get("gap_type") == "unclear-trigger"
                    and (g.get("related") or {}).get("use_case_id") == uid
                ]
            if not trig_gaps:
                errors.append(
                    f"{slug}: {uid} has unknown trigger but no unclear-trigger gap"
                )

        for gid in uc.get("gaps") or []:
            if gid not in gap_ids:
                errors.append(f"{slug}: {uid} references missing gap {gid}")

        kind = uc.get("kind")
        if kind in ("command", "reactive"):
            has_outcome = bool(
                (outcomes.get("domain_events") or [])
                or (outcomes.get("integrations") or [])
                or (outcomes.get("failure_events") or [])
            )
            if not has_outcome and uc.get("status") != "deprecated":
                linked = set(uc.get("gaps") or [])
                miss = [
                    g
                    for g in gaps
                    if g.get("id") in linked and g.get("gap_type") == "missing-outcome"
                ]
                if not miss:
                    warnings.append(
                        f"{slug}: {uid} has no outcomes (consider missing-outcome gap)"
                    )

    # Coverage: commands
    for key in sorted(commands):
        if key not in referenced_commands:
            agg_name, cmd_name = key.split("::", 1)
            orphan_gaps = [
                g
                for g in gaps
                if g.get("gap_type") == "orphan-command"
                and (g.get("related") or {}).get("command") == cmd_name
                and (
                    (g.get("related") or {}).get("aggregate") in (None, agg_name)
                )
            ]
            if not orphan_gaps:
                errors.append(
                    f"{slug}: orphan command {key} with no orphan-command gap"
                )
            else:
                warnings.append(f"{slug}: uncovered command {key} (gap recorded)")

    # Coverage: events
    for ename in sorted(event_names):
        # skip integration_events-only naming already in set
        if ename not in emitted_events:
            # only require for events listed under events[]
            if events_doc:
                domain_only = {e.get("name") for e in (events_doc.get("events") or [])}
                if ename not in domain_only:
                    continue
            orphan_gaps = [
                g
                for g in gaps
                if g.get("gap_type") == "orphan-event"
                and (g.get("related") or {}).get("event") == ename
            ]
            if not orphan_gaps:
                errors.append(
                    f"{slug}: orphan event {ename!r} with no orphan-event gap"
                )
            else:
                warnings.append(f"{slug}: uncovered event {ename!r} (gap recorded)")

    # Coverage: inbound
    if inbound_count and reactive_count == 0:
        orphan_in = [g for g in gaps if g.get("gap_type") == "orphan-inbound"]
        if not orphan_in:
            errors.append(
                f"{slug}: {inbound_count} inbound integration(s) but no reactive "
                "use cases and no orphan-inbound gap"
            )
        else:
            warnings.append(
                f"{slug}: inbound integrations without reactive use cases (gap recorded)"
            )

    blocking_open = [g for g in open_gaps if g.get("blocking")]
    if blocking_open:
        warnings.append(
            f"{slug}: {len(blocking_open)} blocking open gap(s) "
            f"({', '.join(g.get('id') or '?' for g in blocking_open)})"
        )


def validate_process_map(
    root: Path,
    errors: list[str],
    warnings: list[str],
) -> None:
    pm = load_json(root / "process-map.json")
    if pm is None:
        warnings.append("process-map.json missing (ok until Phase 3)")
        return

    uc_index: dict[str, set[str]] = {}
    contexts_dir = root / "contexts"
    if contexts_dir.is_dir():
        for d in contexts_dir.iterdir():
            if not d.is_dir():
                continue
            doc = load_json(d / "use-cases.json")
            if not doc:
                continue
            uc_index[d.name] = {
                u.get("id") for u in (doc.get("use_cases") or []) if u.get("id")
            }

    for proc in pm.get("processes") or []:
        pid = proc.get("id") or "<no-id>"
        for step in proc.get("steps") or []:
            slug = step.get("context_slug")
            uid = step.get("use_case_id")
            if not slug:
                errors.append(f"process-map {pid}: step missing context_slug")
                continue
            if not uid:
                warnings.append(
                    f"process-map {pid}: step order={step.get('order')} "
                    f"in {slug} has empty use_case_id"
                )
                continue
            if slug in uc_index and uid not in uc_index[slug]:
                errors.append(
                    f"process-map {pid}: use_case_id {uid!r} not in "
                    f"contexts/{slug}/use-cases.json"
                )
            elif slug not in uc_index:
                warnings.append(
                    f"process-map {pid}: context {slug} has no use-cases.json yet"
                )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output_root", type=Path)
    parser.add_argument("--strict", action="store_true", help="Treat warnings as errors")
    parser.add_argument("--context", action="append", dest="contexts", default=[])
    args = parser.parse_args()

    root = args.output_root.resolve()
    if not root.is_dir():
        print(f"ERROR: output_root not a directory: {root}", file=sys.stderr)
        return 2

    errors: list[str] = []
    warnings: list[str] = []

    contexts_dir = root / "contexts"
    if not contexts_dir.is_dir():
        print(f"ERROR: no contexts/ under {root}", file=sys.stderr)
        return 2

    slugs = sorted(d.name for d in contexts_dir.iterdir() if d.is_dir())
    if args.contexts:
        missing = set(args.contexts) - set(slugs)
        for m in sorted(missing):
            errors.append(f"unknown context slug: {m}")
        slugs = [s for s in slugs if s in args.contexts]

    for slug in slugs:
        validate_context(slug, contexts_dir / slug, errors, warnings)

    validate_process_map(root, errors, warnings)

    for w in warnings:
        print(f"WARN: {w}")
    for e in errors:
        print(f"ERROR: {e}")

    if args.strict:
        strict_fail = list(errors)
        for w in warnings:
            if "blocking open gap" in w:
                strict_fail.append(w)
        if strict_fail:
            print(
                f"\nSTRICT FAIL: {len(errors)} error(s), "
                f"{len(warnings)} warning(s) ({len(strict_fail)} strict failures)"
            )
            return 1
        print(f"\nOK (strict): {len(warnings)} warning(s)")
        return 0

    if errors:
        print(f"\nFAIL: {len(errors)} error(s), {len(warnings)} warning(s)")
        return 1

    print(f"\nOK: {len(warnings)} warning(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
