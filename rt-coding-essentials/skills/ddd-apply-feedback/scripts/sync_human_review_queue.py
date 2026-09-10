#!/usr/bin/env python3
"""
Build human/review-queue.json from machine artifacts (gaps, confidence, boundaries).

Agent-maintained output — humans answer via human/responses/ and human/ad-hoc/.

Usage:
  python3 sync_human_review_queue.py <output_root>
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

QUEUE_SCHEMA = "human/review-queue/v1"
PRIORITY_BOUNDARY = 1
PRIORITY_BLOCKING_GAP = 2
PRIORITY_PROCESS_GAP = 3
PRIORITY_CONFIDENCE = 4
PRIORITY_NON_BLOCKING = 5


def load_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def next_rq_id(n: int) -> str:
    return f"rq-{n:03d}"


def parse_open_questions(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8")
    items: list[dict[str, Any]] = []
    current_section = "general"
    for line in text.splitlines():
        if line.startswith("## "):
            current_section = line[3:].strip().lower().replace(" ", "-")
            continue
        if current_section == "resolved":
            continue
        m = re.match(r"^- \*\*Question:\*\*\s*(.+)", line)
        if m:
            items.append(
                {
                    "section": current_section,
                    "question": m.group(1).strip(),
                    "blocking": False,
                    "status": "open",
                }
            )
            continue
        m = re.match(r"^- \*\*gap-(\d+)", line)
        if m:
            gap_id = f"gap-{m.group(1).zfill(3)}"
            blocking = "Blocking: yes" in line or "**Blocking:** yes" in line
            items.append(
                {
                    "section": current_section,
                    "gap_id": gap_id,
                    "question": line.strip().lstrip("- "),
                    "blocking": blocking,
                    "status": "open",
                }
            )
    return items


def collect_boundary_items(context_map: dict[str, Any], start_id: int) -> tuple[list[dict], int]:
    items: list[dict[str, Any]] = []
    n = start_id
    for rel in context_map.get("relationships", []):
        conf = rel.get("confidence", "high")
        if conf not in ("low", "medium"):
            continue
        slug_a = rel.get("upstream_slug") or rel.get("from_context_slug", "")
        slug_b = rel.get("downstream_slug") or rel.get("to_context_slug", "")
        contexts = [s for s in (slug_a, slug_b) if s]
        items.append(
            {
                "id": next_rq_id(n),
                "priority": PRIORITY_BOUNDARY,
                "blocking": True,
                "category": "boundary",
                "context_slugs": contexts,
                "source_ref": rel.get("id", ""),
                "source_artifact": "context-map.json",
                "view_link": "views/context-map.md",
                "question": (
                    f"Confirm relationship {slug_a} → {slug_b} "
                    f"({rel.get('pattern', rel.get('relationship_type', 'unknown'))}, confidence={conf})"
                ),
                "hypotheses": rel.get("notes", []) if isinstance(rel.get("notes"), list) else [],
                "depends_on": [],
                "blocks": [],
                "confidence": conf,
                "status": "open",
            }
        )
        n += 1
    return items, n


def collect_glossary_items(ul: dict[str, Any], start_id: int) -> tuple[list[dict], int]:
    items: list[dict[str, Any]] = []
    n = start_id
    for term in ul.get("terms", []):
        conf = term.get("confidence", "high")
        status = term.get("status", "proposed")
        if conf not in ("low", "medium") and status != "proposed":
            continue
        name = term.get("term", "")
        items.append(
            {
                "id": next_rq_id(n),
                "priority": PRIORITY_CONFIDENCE,
                "blocking": conf == "low",
                "category": "glossary",
                "context_slugs": term.get("context_slugs", []),
                "source_ref": name,
                "source_artifact": "ubiquitous-language.json",
                "view_link": "views/glossary.md",
                "question": f"Validate or correct definition of term '{name}'",
                "hypotheses": [],
                "depends_on": [],
                "blocks": [],
                "confidence": conf,
                "status": "open",
            }
        )
        n += 1
    return items, n


def collect_aggregate_items(root: Path, start_id: int) -> tuple[list[dict], int]:
    items: list[dict[str, Any]] = []
    n = start_id
    for agg_path in sorted((root / "contexts").glob("*/aggregates.json")):
        slug = agg_path.parent.name
        data = load_json(agg_path)
        for agg in data.get("aggregates", []):
            conf = agg.get("confidence", "high")
            if conf not in ("low", "medium"):
                continue
            name = agg.get("name", "unknown")
            items.append(
                {
                    "id": next_rq_id(n),
                    "priority": PRIORITY_CONFIDENCE,
                    "blocking": conf == "low",
                    "category": "aggregate",
                    "context_slugs": [slug],
                    "source_ref": name,
                    "source_artifact": f"contexts/{slug}/aggregates.json",
                    "view_link": f"views/contexts/{slug}.md",
                    "question": f"Review aggregate '{name}' boundaries, commands, and attributes",
                    "hypotheses": [],
                    "depends_on": [],
                    "blocks": [],
                    "confidence": conf,
                    "status": "open",
                }
            )
            n += 1
    return items, n


def gap_to_item(gap: dict[str, Any], slug: str, artifact: str, n: int, process: str = "") -> dict[str, Any]:
    gap_id = gap.get("id", "")
    blocking = bool(gap.get("blocking", False))
    gap_type = gap.get("gap_type", "unknown")
    uc_ids = gap.get("use_case_ids") or gap.get("use_cases") or []
    if isinstance(uc_ids, str):
        uc_ids = [uc_ids]
    question_bits = [gap_type.replace("-", " ")]
    if uc_ids:
        question_bits.append(f"for {', '.join(uc_ids)}")
    if process:
        question_bits.append(f"in process {process}")
    hypotheses = gap.get("candidate_hypotheses", [])
    return {
        "id": next_rq_id(n),
        "priority": PRIORITY_BLOCKING_GAP if blocking else PRIORITY_NON_BLOCKING,
        "blocking": blocking,
        "category": "use-case-gap" if "use-cases" in artifact else "process-map-gap",
        "context_slugs": [slug] if slug else [],
        "source_ref": gap_id,
        "source_artifact": artifact,
        "view_link": f"views/contexts/{slug}.md" if slug else "views/process-map.md",
        "question": gap.get("description") or " — ".join(question_bits),
        "hypotheses": hypotheses if isinstance(hypotheses, list) else [],
        "depends_on": [],
        "blocks": [],
        "confidence": gap.get("confidence", "low"),
        "status": gap.get("status", "open"),
        "gap_type": gap_type,
    }


def collect_gap_items(root: Path, start_id: int) -> tuple[list[dict], int]:
    items: list[dict[str, Any]] = []
    n = start_id
    for uc_path in sorted((root / "contexts").glob("*/use-cases.json")):
        slug = uc_path.parent.name
        data = load_json(uc_path)
        for gap in data.get("gaps", []):
            if gap.get("status", "open") != "open":
                continue
            items.append(
                gap_to_item(gap, slug, f"contexts/{slug}/use-cases.json", n)
            )
            n += 1
    proc_path = root / "process-map.json"
    if proc_path.exists():
        proc = load_json(proc_path)
        for gap in proc.get("gaps", []):
            if gap.get("status", "open") != "open":
                continue
            proc_id = gap.get("process_id", "")
            items.append(
                gap_to_item(gap, "", "process-map.json", n, process=proc_id)
            )
            n += 1
    return items, n


def wire_dependencies(items: list[dict[str, Any]]) -> None:
    by_context: dict[str, list[str]] = {}
    boundaries: list[str] = []
    for item in items:
        if item["category"] == "boundary":
            boundaries.append(item["id"])
        for slug in item.get("context_slugs", []):
            by_context.setdefault(slug, []).append(item["id"])

    for item in items:
        if item["category"] in ("use-case-gap", "aggregate", "glossary") and item.get("context_slugs"):
            deps = []
            blocks_from = []
            for slug in item["context_slugs"]:
                for bid in boundaries:
                    b_item = next((x for x in items if x["id"] == bid), None)
                    if b_item and slug in b_item.get("context_slugs", []):
                        deps.append(bid)
            item["depends_on"] = sorted(set(deps))
        gap_type = item.get("gap_type", "")
        if gap_type == "unclear-trigger" and item.get("source_ref"):
            actor_sibling = next(
                (
                    x
                    for x in items
                    if x.get("gap_type") == "unclear-actor"
                    and x.get("source_artifact") == item.get("source_artifact")
                    and x["id"] != item["id"]
                ),
                None,
            )
            if actor_sibling:
                item["depends_on"] = sorted(set(item.get("depends_on", []) + [actor_sibling["id"]]))
                actor_sibling.setdefault("blocks", []).append(item["id"])

    for item in items:
        item["blocks"] = sorted(set(item.get("blocks", [])))


def sort_queue(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    def sort_key(it: dict[str, Any]) -> tuple:
        dep_depth = len(it.get("depends_on", []))
        return (it.get("priority", 99), dep_depth, it.get("id", ""))

    return sorted(items, key=sort_key)


def render_review_board(queue: dict[str, Any], human_dir: Path) -> None:
    lines = [
        "# Review board",
        "",
        "> **Generated** — do not edit. Answer items in `responses/` or `ad-hoc/`, then run **ddd-apply-feedback**.",
        "",
        f"Last sync: {queue.get('generated_at', '')} · Open items: {sum(1 for i in queue['items'] if i.get('status') == 'open')}",
        "",
        "## How to respond",
        "",
        "1. Pick the **first open item** with all `depends_on` satisfied (or any item if none blocked).",
        "2. Copy `responses/TEMPLATE.md` → `responses/{rq-id}.md` and fill in **Answer**.",
        "3. For issues not listed here, use `ad-hoc/feedback.md`.",
        "4. Ask the agent to **apply feedback** (triggers `ddd-apply-feedback` skill).",
        "",
        "## Ordered queue",
        "",
    ]
    open_items = [i for i in queue["items"] if i.get("status") == "open"]
    for item in open_items:
        deps = item.get("depends_on", [])
        dep_note = f" · depends on: {', '.join(deps)}" if deps else ""
        blocks = item.get("blocks", [])
        block_note = f" · unblocks: {', '.join(blocks)}" if blocks else ""
        lines.extend(
            [
                f"### {item['id']} — {item['category']} ({item.get('confidence', '?')} confidence)",
                "",
                f"- **Blocking:** {'yes' if item.get('blocking') else 'no'}{dep_note}{block_note}",
                f"- **Question:** {item['question']}",
                f"- **Source:** `{item.get('source_artifact', '')}` → `{item.get('source_ref', '')}`",
                f"- **View:** [{item.get('view_link', '')}]({item.get('view_link', '')})",
            ]
        )
        if item.get("hypotheses"):
            lines.append("- **Choose one (or write your own):**")
            for h in item["hypotheses"]:
                lines.append(f"  - `{h}`")
        lines.append("")

    if not open_items:
        lines.append("_No open review items — add ad-hoc feedback or re-run discovery._")
        lines.append("")

    (human_dir / "review-board.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync human review queue from machine artifacts")
    parser.add_argument("output_root", type=Path)
    args = parser.parse_args()
    root = args.output_root.resolve()
    human_dir = root / "human"
    human_dir.mkdir(parents=True, exist_ok=True)
    (human_dir / "responses").mkdir(exist_ok=True)
    (human_dir / "ad-hoc").mkdir(exist_ok=True)

    items: list[dict[str, Any]] = []
    n = 1

    context_map_path = root / "context-map.json"
    if context_map_path.exists():
        boundary_items, n = collect_boundary_items(load_json(context_map_path), n)
        items.extend(boundary_items)

    ul_path = root / "ubiquitous-language.json"
    if ul_path.exists():
        glossary_items, n = collect_glossary_items(load_json(ul_path), n)
        items.extend(glossary_items)

    agg_items, n = collect_aggregate_items(root, n)
    items.extend(agg_items)

    gap_items, n = collect_gap_items(root, n)
    items.extend(gap_items)

    wire_dependencies(items)
    items = sort_queue(items)

    existing_path = human_dir / "review-queue.json"
    answered: dict[str, str] = {}
    if existing_path.exists():
        prev = load_json(existing_path)
        for it in prev.get("items", []):
            if it.get("status") in ("answered", "deferred", "wont-fix"):
                answered[it["id"]] = it["status"]

    for it in items:
        if it["id"] in answered:
            it["status"] = answered[it["id"]]

    queue = {
        "$schema": QUEUE_SCHEMA,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "items": items,
    }
    existing_path.write_text(json.dumps(queue, indent=2) + "\n", encoding="utf-8")
    render_review_board(queue, human_dir)
    print(f"Synced {len(items)} review items to {human_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
