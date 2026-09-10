#!/usr/bin/env python3
"""
Copy indexed evidence into state_machine.evidence[] when missing.

Targets aggregates with confidence medium/high and empty evidence[].
Sources (in order): aggregate_root.evidence, transition commands' evidence,
matching invariants.evidence.

Usage:
  python3 backfill_state_machine_evidence.py <output_root>
  python3 backfill_state_machine_evidence.py <output_root> --dry-run
"""

from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path
from typing import Any


def dedupe_key(ev: dict[str, Any]) -> tuple[str, str, str]:
    return (
        ev.get("mcp_tool", ""),
        ev.get("project", ""),
        ev.get("target", ""),
    )


def enrich_finding(ev: dict[str, Any], agg_name: str, inference: str) -> dict[str, Any]:
    out = copy.deepcopy(ev)
    base = (out.get("finding") or "").strip()
    suffix = f"Supports {agg_name} state_machine ({inference})"
    if base and suffix.lower() not in base.lower():
        out["finding"] = f"{base} — {suffix}"
    elif not base:
        out["finding"] = suffix
    return out


def collect_sources(agg: dict[str, Any], sm: dict[str, Any]) -> list[dict[str, Any]]:
    sources: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()

    def add(items: list[dict[str, Any]] | None) -> None:
        for ev in items or []:
            if not isinstance(ev, dict):
                continue
            key = dedupe_key(ev)
            if key in seen:
                continue
            seen.add(key)
            sources.append(ev)

    root = agg.get("aggregate_root") or {}
    add(root.get("evidence"))

    cmd_names = {
        tr.get("command")
        for tr in sm.get("transitions") or []
        if tr.get("command")
    }
    for cmd in agg.get("commands") or []:
        if cmd.get("name") in cmd_names:
            add(cmd.get("evidence"))

    for inv in agg.get("invariants") or []:
        add(inv.get("evidence"))

    inference = sm.get("inference") or "unknown"
    agg_name = agg.get("name", "?")
    return [enrich_finding(ev, agg_name, inference) for ev in sources[:4]]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output_root", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    root = args.output_root.resolve()
    contexts_dir = root / "contexts"
    if not contexts_dir.is_dir():
        print(f"ERROR: missing {contexts_dir}", file=sys.stderr)
        return 2

    touched = 0
    for ctx_dir in sorted(contexts_dir.iterdir()):
        if not ctx_dir.is_dir():
            continue
        agg_path = ctx_dir / "aggregates.json"
        if not agg_path.is_file():
            continue
        doc = json.loads(agg_path.read_text(encoding="utf-8"))
        changed = False
        for agg in doc.get("aggregates") or []:
            sm = agg.get("state_machine")
            if not sm:
                continue
            if sm.get("evidence"):
                continue
            if sm.get("confidence") not in ("medium", "high"):
                continue
            sources = collect_sources(agg, sm)
            if not sources:
                print(f"WARN: {ctx_dir.name}/{agg.get('name')}: no source evidence to copy")
                continue
            sm["evidence"] = sources
            changed = True
            touched += 1
            print(f"BACKFILL: {ctx_dir.name}/{agg.get('name')} ({len(sources)} item(s))")

        if changed and not args.dry_run:
            agg_path.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")

    if args.dry_run:
        print(f"\nDRY RUN: would backfill {touched} state machine(s)")
    else:
        print(f"\nBackfilled {touched} state machine(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
