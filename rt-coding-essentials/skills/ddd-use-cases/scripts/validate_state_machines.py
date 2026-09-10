#!/usr/bin/env python3
"""
Validate aggregate and process state_machine artifacts.

Usage:
  python3 validate_state_machines.py <output_root>
  python3 validate_state_machines.py <output_root> --strict
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

VALID_INFERENCE = {
    "explicit",
    "inferred-from-status-column",
    "inferred-from-table-write",
    "inferred-from-job",
    "inferred-from-invariant",
    "inferred-from-command",
    "inferred-from-orchestration",
    "inferred-from-steps",
    "unknown",
}


def load_json(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def state_ids(sm: dict[str, Any]) -> set[str]:
    return {s.get("id") for s in sm.get("states") or [] if s.get("id")}


def validate_aggregate_sm(
    ctx_slug: str,
    agg: dict[str, Any],
    events: set[str],
    errors: list[str],
    warnings: list[str],
) -> None:
    sm = agg.get("state_machine")
    if not sm:
        return
    aname = agg.get("name", "?")
    label = f"{ctx_slug}/{aname}"

    inf = sm.get("inference")
    if inf and inf not in VALID_INFERENCE:
        warnings.append(f"{label}: unknown inference {inf!r}")

    cmds = {c.get("name") for c in agg.get("commands") or [] if c.get("name")}
    ids = state_ids(sm)
    initial = sm.get("initial_state")
    if initial and initial not in ids:
        errors.append(f"{label}: initial_state {initial!r} not in states[]")
    for term in sm.get("terminal_states") or []:
        if term not in ids:
            errors.append(f"{label}: terminal_state {term!r} not in states[]")

    for tr in sm.get("transitions") or []:
        frm, to = tr.get("from"), tr.get("to")
        if frm and frm not in ids:
            errors.append(f"{label}: transition from {frm!r} not in states[]")
        if to and to not in ids:
            errors.append(f"{label}: transition to {to!r} not in states[]")
        if frm == to and not tr.get("guard"):
            warnings.append(f"{label}: self-loop {frm!r} without guard")
        cmd = tr.get("command")
        if cmd and cmd not in cmds:
            warnings.append(f"{label}: transition command {cmd!r} not in aggregate commands[]")
        ev = tr.get("emits_event")
        if ev and events and ev not in events:
            warnings.append(f"{label}: emits_event {ev!r} not in domain-events.json")

    if sm.get("confidence") in ("medium", "high") and not sm.get("evidence"):
        warnings.append(f"{label}: {sm.get('confidence')} confidence but no evidence[]")


def validate_process_sm(
    proc: dict[str, Any],
    uc_index: dict[tuple[str, str], bool],
    errors: list[str],
    warnings: list[str],
) -> None:
    sm = proc.get("state_machine")
    if not sm:
        warnings.append(f"process {proc.get('id')}: missing state_machine")
        return
    pid = proc.get("id", "?")
    label = f"process {pid}"

    inf = sm.get("inference")
    if inf and inf not in VALID_INFERENCE:
        warnings.append(f"{label}: unknown inference {inf!r}")

    ids = state_ids(sm)
    initial = sm.get("initial_state")
    if initial and initial not in ids:
        errors.append(f"{label}: initial_state {initial!r} not in states[]")

    step_orders = {s.get("order") for s in proc.get("steps") or [] if s.get("order")}
    for st in sm.get("states") or []:
        so = st.get("step_order")
        if so is not None and so not in step_orders:
            warnings.append(f"{label}: state {st.get('id')} step_order={so} not in steps[]")

    for tr in sm.get("transitions") or []:
        frm, to = tr.get("from"), tr.get("to")
        if frm and frm not in ids:
            errors.append(f"{label}: transition from {frm!r} not in states[]")
        if to and to not in ids:
            errors.append(f"{label}: transition to {to!r} not in states[]")
        ctx = tr.get("context_slug")
        uid = tr.get("use_case_id")
        if uid and ctx and not uc_index.get((ctx, uid)):
            errors.append(f"{label}: use_case_id {uid!r} not in contexts/{ctx}/use-cases.json")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output_root", type=Path)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()

    root = args.output_root.resolve()
    errors: list[str] = []
    warnings: list[str] = []

    uc_index: dict[tuple[str, str], bool] = {}
    contexts_dir = root / "contexts"
    if contexts_dir.is_dir():
        for d in contexts_dir.iterdir():
            if not d.is_dir():
                continue
            doc = load_json(d / "use-cases.json")
            if not doc:
                continue
            slug = doc.get("context_slug") or d.name
            for uc in doc.get("use_cases") or []:
                if uc.get("id"):
                    uc_index[(slug, uc["id"])] = True

        for d in sorted(contexts_dir.iterdir()):
            if not d.is_dir():
                continue
            slug = d.name
            agg_doc = load_json(d / "aggregates.json")
            ev_doc = load_json(d / "domain-events.json")
            if not agg_doc:
                continue
            event_names = {e.get("name") for e in (ev_doc or {}).get("events") or [] if e.get("name")}
            for agg in agg_doc.get("aggregates") or []:
                validate_aggregate_sm(slug, agg, event_names, errors, warnings)

    pm = load_json(root / "process-map.json")
    if pm:
        for proc in pm.get("processes") or []:
            validate_process_sm(proc, uc_index, errors, warnings)

    for w in warnings:
        print(f"WARN: {w}")
    for e in errors:
        print(f"ERROR: {e}")

    if args.strict and (errors or warnings):
        print(f"\nSTRICT FAIL: {len(errors)} error(s), {len(warnings)} warning(s)")
        return 1
    if errors:
        print(f"\nFAIL: {len(errors)} error(s), {len(warnings)} warning(s)")
        return 1
    print(f"\nOK: {len(warnings)} warning(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
