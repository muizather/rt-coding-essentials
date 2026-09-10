#!/usr/bin/env python3
"""
Rebuild processes[].state_machine from steps[] + events (deterministic baseline).

Usage:
  python3 infer_process_state_machines.py <output_root>
  python3 infer_process_state_machines.py <output_root> --process proc-001
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any


def slugify_event(name: str) -> str:
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", name)
    s = re.sub(r"[^a-zA-Z0-9_]+", "_", s).lower().strip("_")
    return s[:48] or "state"


def infer_from_steps(proc: dict[str, Any]) -> dict[str, Any]:
    steps = sorted(proc.get("steps") or [], key=lambda x: x.get("order") or 0)
    pid = proc.get("id", "proc")
    name = proc.get("name", pid) + "Lifecycle"

    states: list[dict[str, Any]] = []
    transitions: list[dict[str, Any]] = []
    state_by_event: dict[str, str] = {}

    # Optional pre-step state when first step has no inbound trigger
    initial_id = "start"
    if steps and not steps[0].get("triggered_by_event"):
        states.append({
            "id": initial_id,
            "label": "Start",
            "description": "Before first step",
            "step_order": None,
        })
        cursor = initial_id
    else:
        cursor = None

    for step in steps:
        order = step.get("order")
        ctx = step.get("context_slug", "")
        uid = step.get("use_case_id") or ""
        produces = step.get("produces_event")
        triggered = step.get("triggered_by_event")

        if produces:
            sid = slugify_event(produces)
            if sid not in state_by_event:
                state_by_event[produces] = sid
                states.append({
                    "id": sid,
                    "label": produces,
                    "description": step.get("notes", "")[:120],
                    "step_order": order,
                })
            target = sid
        else:
            sid = f"step_{order}"
            states.append({
                "id": sid,
                "label": f"Step {order}",
                "description": uid or ctx,
                "step_order": order,
            })
            target = sid

        if cursor is None:
            if triggered:
                # first state is the triggered event state if we can name it
                tsid = slugify_event(triggered)
                if not any(s["id"] == tsid for s in states):
                    states.insert(0, {
                        "id": tsid,
                        "label": triggered,
                        "description": "Inbound trigger",
                        "step_order": None,
                    })
                cursor = tsid
            else:
                cursor = initial_id if states else target

        trigger_label = uid or step.get("notes", "")[:40] or f"step-{order}"
        transitions.append({
            "from": cursor,
            "to": target,
            "trigger": trigger_label,
            "use_case_id": uid or None,
            "context_slug": ctx,
            "guard": "",
            "emits_event": produces,
        })
        cursor = target

    terminal = [states[-1]["id"]] if states else []
    # failure branches: terminal states from produces_event on failure-like names
    for st in states:
        if "fail" in st["id"].lower():
            if st["id"] not in terminal:
                terminal.append(st["id"])

    return {
        "name": name,
        "description": f"Auto-inferred from steps for {pid}",
        "initial_state": states[0]["id"] if states else None,
        "terminal_states": terminal,
        "states": states,
        "transitions": transitions,
        "status": proc.get("status", "proposed"),
        "confidence": "low",
        "inference": "inferred-from-steps",
        "evidence": [{
            "mcp_tool": "infer_process_state_machines",
            "project": "n/a",
            "target": pid,
            "finding": "Rebuilt from steps[] order and event names",
        }],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output_root", type=Path)
    parser.add_argument("--process", action="append", dest="processes", default=[])
    parser.add_argument("--merge", action="store_true",
                        help="Only fill state_machine if missing; default overwrites")
    args = parser.parse_args()

    root = args.output_root.resolve()
    pm_path = root / "process-map.json"
    if not pm_path.is_file():
        print(f"ERROR: missing {pm_path}", file=sys.stderr)
        return 2

    pm = json.loads(pm_path.read_text(encoding="utf-8"))
    touched = 0
    for proc in pm.get("processes") or []:
        pid = proc.get("id")
        if args.processes and pid not in args.processes:
            continue
        if args.merge and proc.get("state_machine"):
            continue
        proc["state_machine"] = infer_from_steps(proc)
        touched += 1

    pm_path.write_text(json.dumps(pm, indent=2) + "\n", encoding="utf-8")
    print(f"Inferred state_machine for {touched} process(es) -> {pm_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
