#!/usr/bin/env python3
"""
Deterministic renderer: domain model JSON -> views/ Markdown + Mermaid.

Contract: render-contract/v1/ (see CONTRACT.md). Bump contract version when
changing frozen field paths; update this script in the same change.

Usage:
  python3 render_domain_views.py <output_root>
  python3 render_domain_views.py <output_root> --validate-only
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

CONTRACT_VERSION = "views/v1"
SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_DIR = SCRIPT_DIR.parent
MANIFEST_PATH = SKILL_DIR / "render-contract" / "v1" / "manifest.json"

TYPE_ORDER = ("core", "supporting", "generic")
TYPE_LABELS = {
    "core": "Core domains",
    "supporting": "Supporting",
    "generic": "Generic / infrastructure",
}


def load_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def mermaid_id(slug: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_]", "_", slug)


def mermaid_label(text: str, max_len: int = 48) -> str:
    t = text.replace('"', "'").replace("\n", " ")
    if len(t) > max_len:
        t = t[: max_len - 3].rstrip("-_ ")
        t += "..."
    return t


def mermaid_mindmap_id(text: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9_]", "_", text)
    base = re.sub(r"_+", "_", base).strip("_")
    if not base:
        base = "node"
    if base[0].isdigit():
        base = f"n_{base}"
    return base


def render_glossary_term_tree(by_ctx: dict[str, list[dict]], platform_name: str) -> list[str]:
    """Flowchart term tree — mindmap type is unsupported in many Markdown previews."""
    lines = ["flowchart TB", f'  root["{mermaid_label(platform_name, 40)}"]']
    for slug in sorted(by_ctx.keys()):
        if slug == "_unscoped":
            continue
        ctx_id = mermaid_mindmap_id(slug)
        ctx_label = mermaid_label(slug, 24)
        lines.append(f'  root --> {ctx_id}["{ctx_label}"]')
        for term in sorted(by_ctx[slug], key=lambda t: t.get("term", ""))[:8]:
            term_name = term.get("term", "")
            term_id = mermaid_mindmap_id(f"{slug}_{term_name}")
            term_label = mermaid_label(term_name, 20)
            lines.append(f'  {ctx_id} --> {term_id}["{term_label}"]')
    return lines


def entity_name(name: str) -> str:
    parts = re.split(r"[_\s-]+", name)
    return "".join(p.capitalize() for p in parts if p)


def edge_arrow(status: str) -> str:
    if status == "validated":
        return "-->"
    if status == "deprecated":
        return "-.->|deprecated|"
    return "-.->"


def check_contract_marker(data: dict[str, Any], path: Path, warnings: list[str]) -> None:
    contract = data.get("$render_contract")
    if contract is None:
        warnings.append(f"{path}: missing $render_contract (assuming {CONTRACT_VERSION})")
    elif contract != CONTRACT_VERSION:
        warnings.append(
            f"{path}: $render_contract={contract!r} but renderer supports {CONTRACT_VERSION!r}"
        )


def get_at_path(obj: Any, path: str) -> list[Any]:
    """Resolve path like 'contexts[].slug' or 'relationships[].integration.mechanism'."""
    if not path:
        return [obj]

    if "[]." in path:
        array_prefix, rest = path.split("[].", 1)
        array_vals = get_at_path(obj, array_prefix)
        results: list[Any] = []
        for item in array_vals:
            if isinstance(item, list):
                for child in item:
                    results.extend(get_at_path(child, rest))
            else:
                results.extend(get_at_path(item, rest))
        return results

    if path.endswith("[]"):
        key = path[:-2]
        results = []
        if isinstance(obj, dict) and key in obj and isinstance(obj[key], list):
            results.extend(obj[key])
        return results

    if "." in path:
        head, tail = path.split(".", 1)
        results = []
        for item in get_at_path(obj, head):
            results.extend(get_at_path(item, tail))
        return results

    if isinstance(obj, dict) and path in obj:
        val = obj[path]
        if isinstance(val, list):
            return val
        return [val]
    return []


def validate_frozen(data: dict[str, Any], frozen_paths: list[str], file_label: str) -> list[str]:
    errors: list[str] = []
    for path in frozen_paths:
        if "[]." in path:
            array_prefix = path.split("[].", 1)[0]
            parents = get_at_path(data, array_prefix)
            if not parents:
                continue
            values = get_at_path(data, path)
            if len(values) != len(parents):
                field = path.split("[].", 1)[1]
                for i, parent in enumerate(parents):
                    if not isinstance(parent, dict):
                        errors.append(f"{file_label}: {array_prefix}[{i}] is not an object")
                        continue
                    if field not in parent or parent[field] is None:
                        errors.append(f"{file_label}: missing frozen field {path} at index {i}")
            elif any(v is None for v in values):
                errors.append(f"{file_label}: null frozen field {path}")
        else:
            values = get_at_path(data, path)
            if not values:
                errors.append(f"{file_label}: missing frozen field {path}")
            elif values[0] is None:
                errors.append(f"{file_label}: null frozen field {path}")
    return errors


def validate_model(root: Path) -> tuple[list[str], list[str]]:
    manifest = load_json(MANIFEST_PATH)
    errors: list[str] = []
    warnings: list[str] = []

    def validate_file(data: dict[str, Any], path: Path, artifact_key: str, label: str) -> None:
        check_contract_marker(data, path, warnings)
        spec = manifest["artifacts"][artifact_key]
        errors.extend(validate_frozen(data, spec["frozen_paths"], label))
        if get_at_path(data, "integration_events") and artifact_key.endswith("domain-events.json"):
            for opt_path in spec.get("frozen_when_present", []):
                if opt_path.startswith("integration_events") and get_at_path(data, "integration_events"):
                    errors.extend(validate_frozen(data, [opt_path], label))

    cm_path = root / "context-map.json"
    if cm_path.exists():
        validate_file(load_json(cm_path), cm_path, "context-map.json", "context-map.json")

    ul_path = root / "ubiquitous-language.json"
    if ul_path.exists():
        validate_file(load_json(ul_path), ul_path, "ubiquitous-language.json", "ubiquitous-language.json")

    contexts_dir = root / "contexts"
    if contexts_dir.is_dir():
        for slug_dir in sorted(contexts_dir.iterdir()):
            if not slug_dir.is_dir():
                continue
            slug = slug_dir.name
            for artifact in (
                "bounded-context.json",
                "aggregates.json",
                "domain-events.json",
                "integrations.json",
            ):
                p = slug_dir / artifact
                if not p.exists():
                    continue
                key = f"contexts/{{slug}}/{artifact}"
                validate_file(load_json(p), p, key, f"contexts/{slug}/{artifact}")

    return errors, warnings


def render_context_map(data: dict[str, Any]) -> str:
    lines = [
        f"# Context map — {data.get('platform_name', 'platform')}",
        "",
        f"Status: **{data.get('status', '?')}** | Confidence: **{data.get('confidence', '?')}** | Updated: {data.get('last_updated', '?')}",
        "",
        "## Legend",
        "",
        "- Solid arrow: `validated` relationship",
        "- Dotted arrow: `proposed` relationship",
        "- Edge label: `mechanism` / DDD pattern",
        "",
        "```mermaid",
        "flowchart TB",
    ]

    contexts = data.get("contexts", [])
    by_type: dict[str, list[dict]] = {t: [] for t in TYPE_ORDER}
    for ctx in contexts:
        t = ctx.get("type", "core")
        by_type.setdefault(t, []).append(ctx)

    for t in TYPE_ORDER:
        group = by_type.get(t, [])
        if not group:
            continue
        gid = mermaid_id(f"subgraph_{t}")
        lines.append(f'  subgraph {gid}["{TYPE_LABELS.get(t, t)}"]')
        for ctx in group:
            nid = mermaid_id(ctx["slug"])
            label = mermaid_label(ctx.get("name", ctx["slug"]))
            conf = ctx.get("confidence", "")
            lines.append(f'    {nid}["{label}<br/>{ctx["slug"]}<br/>{conf}"]')
        lines.append("  end")

    slugs = {c["slug"] for c in contexts}
    for rel in data.get("relationships", []):
        up = rel.get("upstream_slug", "")
        down = rel.get("downstream_slug", "")
        if up not in slugs or down not in slugs:
            continue
        arrow = edge_arrow(rel.get("status", "proposed"))
        mech = rel.get("integration", {}).get("mechanism", "")
        pattern = rel.get("pattern", "")
        label = mermaid_label(f"{mech}; {pattern}", 40)
        lines.append(
            f"  {mermaid_id(up)} {arrow}|{label}| {mermaid_id(down)}"
        )

    lines.append("```")
    lines.append("")

    kernels = data.get("shared_kernels", [])
    if kernels:
        lines.append("## Shared kernels")
        lines.append("")
        for sk in kernels:
            names = ", ".join(sk.get("context_slugs", []))
            lines.append(f"- **{sk.get('name', 'kernel')}** ({names})")
            if sk.get("notes"):
                lines.append(f"  - {sk['notes']}")
        lines.append("")

    return "\n".join(lines)


def render_glossary(data: dict[str, Any]) -> str:
    lines = [
        f"# Ubiquitous language — {data.get('platform_name', 'platform')}",
        "",
        "## Terms by context",
        "",
        "| Term | Contexts | Confidence | Status | Definition |",
        "|------|----------|------------|--------|------------|",
    ]

    by_ctx: dict[str, list[dict]] = {}
    for term in data.get("terms", []):
        for slug in term.get("context_slugs", ["_unscoped"]):
            by_ctx.setdefault(slug, []).append(term)

    for term in sorted(data.get("terms", []), key=lambda t: t.get("term", "")):
        ctxs = ", ".join(term.get("context_slugs", []))
        defn = mermaid_label(term.get("definition", ""), 80)
        lines.append(
            f"| {term.get('term', '')} | {ctxs} | {term.get('confidence', '')} | {term.get('status', '')} | {defn} |"
        )

    lines.extend(["", "## Term map (by context)", "", "```mermaid"])
    root = data.get("platform_name", "platform")
    lines.extend(render_glossary_term_tree(by_ctx, root))
    lines.extend(["```", ""])
    return "\n".join(lines)


def render_aggregate_diagram(aggregates: list[dict]) -> list[str]:
    lines: list[str] = []
    for agg in aggregates:
        root = agg.get("aggregate_root", {})
        root_ent = entity_name(root.get("name", agg.get("name", "Root")))
        lines.append(f"### {agg.get('name', 'Aggregate')}")
        lines.append("")
        lines.append("```mermaid")
        lines.append("erDiagram")

        idents = root.get("identifiers", [])
        attrs = root.get("attributes", [])
        root_fields = idents + attrs
        if root_fields:
            field_lines = []
            for f in idents:
                field_lines.append(f"    {f} string PK")
            for f in attrs:
                field_lines.append(f"    {f} string")
            lines.append(f"  {root_ent} {{")
            lines.extend(field_lines)
            lines.append("  }")

        for ent in agg.get("entities", []):
            ename = entity_name(ent.get("name", "Entity"))
            eidents = ent.get("identifiers", [])
            eattrs = ent.get("attributes", [])
            if eidents or eattrs:
                lines.append(f"  {ename} {{")
                for f in eidents:
                    lines.append(f"    {f} string")
                for f in eattrs:
                    lines.append(f"    {f} string")
                lines.append("  }")
            role = ent.get("role", "child-entity")
            if role == "child-entity":
                lines.append(f"  {root_ent} ||--o| {ename} : has")
            else:
                lines.append(f"  {root_ent} }}o--|| {ename} : references")

        for vo in agg.get("value_objects", []):
            voname = entity_name(vo.get("name", "ValueObject"))
            vattrs = vo.get("attributes", [])
            if vattrs:
                lines.append(f"  {voname} {{")
                for f in vattrs:
                    lines.append(f"    {f} string")
                lines.append("  }")

        lines.append("```")
        lines.append("")
        if agg.get("invariants"):
            lines.append("**Invariants:**")
            for inv in agg["invariants"]:
                lines.append(f"- {inv.get('rule', '')} ({inv.get('confidence', '')})")
            lines.append("")

        sm = agg.get("state_machine")
        if sm and (sm.get("states") or sm.get("transitions")):
            lines.extend(render_state_machine(sm, heading="#### State machine"))
    return lines


def mermaid_state_id(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9_]", "_", text or "state")
    if s and s[0].isdigit():
        s = "s_" + s
    return s[:64] or "state"


def render_state_machine(sm: dict[str, Any], heading: str = "#### State machine") -> list[str]:
    """Render Mermaid stateDiagram-v2 from shared state_machine shape."""
    lines: list[str] = [heading, ""]
    name = sm.get("name") or "Lifecycle"
    conf = sm.get("confidence", "?")
    status = sm.get("status", "?")
    inference = sm.get("inference", "")
    field = sm.get("state_field")
    meta = f"**{name}** | status: `{status}` | confidence: `{conf}`"
    if field:
        meta += f" | field: `{field}`"
    if inference:
        meta += f" | inference: `{inference}`"
    lines.append(meta)
    if sm.get("description"):
        lines.append("")
        lines.append(sm["description"])
    lines.extend(["", "```mermaid", "stateDiagram-v2"])

    initial = sm.get("initial_state")
    if initial:
        lines.append(f"  [*] --> {mermaid_state_id(initial)}")

    for st in sm.get("states") or []:
        sid = mermaid_state_id(st.get("id", "state"))
        label = mermaid_label(st.get("label") or st.get("id", ""), 28)
        lines.append(f"  {sid} : {label}")

    for tr in sm.get("transitions") or []:
        frm = tr.get("from") or ""
        to = tr.get("to") or ""
        if not frm or not to:
            continue
        edge_bits = [tr.get("trigger") or ""]
        if tr.get("command"):
            edge_bits.append(f"cmd:{tr['command']}")
        if tr.get("use_case_id"):
            edge_bits.append(tr["use_case_id"])
        if tr.get("emits_event"):
            edge_bits.append(f"→{tr['emits_event']}")
        label = mermaid_label(" / ".join(b for b in edge_bits if b), 40)
        arrow = f"  {mermaid_state_id(frm)} --> {mermaid_state_id(to)}"
        if label:
            arrow += f" : {label}"
        lines.append(arrow)

    for term in sm.get("terminal_states") or []:
        lines.append(f"  {mermaid_state_id(term)} --> [*]")

    lines.extend(["```", ""])
    return lines


def render_integrations(data: dict[str, Any], slug: str) -> list[str]:
    lines = ["## Integrations", "", "```mermaid", "flowchart LR", f'  center["{mermaid_label(slug, 30)}"]']
    for ib in data.get("inbound", []):
        src = ib.get("from_context_slug", "unknown")
        sid = mermaid_id(src)
        mech = ib.get("mechanism", "")
        lines.append(f'  {sid}["{mermaid_label(src, 24)}"] -->|{mech} in| center')
    for ob in data.get("outbound", []):
        tgt = ob.get("to_context_slug", "unknown")
        tid = mermaid_id(tgt)
        mech = ob.get("mechanism", "")
        lines.append(f"  center -->|{mech} out| {tid}[\"{mermaid_label(tgt, 24)}\"]")
    lines.extend(["```", ""])
    return lines


def render_events(data: dict[str, Any]) -> list[str]:
    lines = ["## Domain events", ""]
    events = data.get("events", [])
    if events:
        lines.extend(["```mermaid", "flowchart TB"])
        for ev in events:
            eid = mermaid_id(ev.get("name", "event"))
            agg = ev.get("emitted_by_aggregate", "")
            inference = ev.get("inference", "explicit")
            label = mermaid_label(f"{ev.get('name', '')} ({inference})", 36)
            lines.append(f'  {eid}["{label}<br/>{mermaid_label(ev.get("past_tense", ""), 40)}"]')
            lines.append(f'  agg_{eid}["{mermaid_label(agg, 20)}"] --> {eid}')
            for cons in ev.get("consumers", []):
                cid = mermaid_id(cons.get("context_slug", "consumer"))
                lines.append(f"  {eid} -.-> {cid}")
        lines.extend(["```", ""])

    integ = data.get("integration_events", [])
    if integ:
        lines.append("### Integration events")
        lines.append("")
        lines.append("| Event | Source | Target | Transport |")
        lines.append("|-------|--------|--------|-----------|")
        for ie in integ:
            lines.append(
                f"| {ie.get('name', '')} | {ie.get('source_context', '')} | {ie.get('target_context', '')} | {ie.get('transport', '')} |"
            )
        lines.append("")
    return lines


def render_context_file(
    slug: str,
    bc: dict[str, Any],
    aggregates: dict[str, Any] | None,
    events: dict[str, Any] | None,
    integrations: dict[str, Any] | None,
) -> str:
    lines = [
        f"# {bc.get('name', slug)}",
        "",
        f"**Slug:** `{slug}` | **Type:** {bc.get('type', '?')} | **Status:** {bc.get('status', '?')}",
        "",
        bc.get("description", ""),
        "",
        "## Responsibilities",
        "",
    ]
    for r in bc.get("responsibilities", []):
        lines.append(f"- {r}")
    lines.extend(["", "## Out of scope", ""])
    for o in bc.get("out_of_scope", []):
        lines.append(f"- {o}")
    lines.append("")

    if aggregates and aggregates.get("aggregates"):
        lines.append("## Aggregates")
        lines.append("")
        lines.extend(render_aggregate_diagram(aggregates["aggregates"]))

    if integrations:
        lines.extend(render_integrations(integrations, slug))

    if events:
        lines.extend(render_events(events))

    return "\n".join(lines)


def render_index(root: Path, platform_name: str, slugs: list[str]) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    script_path = SCRIPT_DIR / "render_domain_views.py"
    lines = [
        f"# Domain model views — {platform_name}",
        "",
        "Human-readable projections of JSON artifacts. **Do not edit by hand** — regenerate with:",
        "",
        "```bash",
        f"python3 {script_path} {root}",
        "```",
        "",
        f"Render contract: `{CONTRACT_VERSION}` — see `.cursor/skills/ddd-domain-model/render-contract/v1/CONTRACT.md`",
        "",
        f"Generated: {now}",
        "",
        "## Index",
        "",
        "- [Context map](context-map.md) — bounded contexts and strategic relationships",
        "- [Glossary](glossary.md) — ubiquitous language",
        "- [Human review board](../human/review-board.md) — ordered questions and feedback loop",
        "",
        "## Bounded contexts",
        "",
    ]
    for slug in slugs:
        lines.append(f"- [{slug}](contexts/{slug}.md)")
    lines.append("")
    return "\n".join(lines)


def render_all(root: Path) -> list[str]:
    warnings: list[str] = []
    views = root / "views"
    contexts_views = views / "contexts"
    views.mkdir(parents=True, exist_ok=True)
    contexts_views.mkdir(parents=True, exist_ok=True)

    cm_path = root / "context-map.json"
    platform_name = "platform"
    if cm_path.exists():
        cm = load_json(cm_path)
        platform_name = cm.get("platform_name", platform_name)
        (views / "context-map.md").write_text(render_context_map(cm) + "\n", encoding="utf-8")

    ul_path = root / "ubiquitous-language.json"
    if ul_path.exists():
        ul = load_json(ul_path)
        (views / "glossary.md").write_text(render_glossary(ul) + "\n", encoding="utf-8")

    slugs: list[str] = []
    contexts_dir = root / "contexts"
    if contexts_dir.is_dir():
        for slug_dir in sorted(contexts_dir.iterdir()):
            if not slug_dir.is_dir():
                continue
            slug = slug_dir.name
            slugs.append(slug)
            bc_path = slug_dir / "bounded-context.json"
            if not bc_path.exists():
                warnings.append(f"Skipping {slug}: no bounded-context.json")
                continue
            bc = load_json(bc_path)
            agg = load_json(slug_dir / "aggregates.json") if (slug_dir / "aggregates.json").exists() else None
            ev = load_json(slug_dir / "domain-events.json") if (slug_dir / "domain-events.json").exists() else None
            integ = load_json(slug_dir / "integrations.json") if (slug_dir / "integrations.json").exists() else None
            content = render_context_file(slug, bc, agg, ev, integ)
            (contexts_views / f"{slug}.md").write_text(content + "\n", encoding="utf-8")

    (views / "README.md").write_text(render_index(root, platform_name, slugs) + "\n", encoding="utf-8")
    return warnings


def main() -> int:
    parser = argparse.ArgumentParser(description="Render domain model views from JSON")
    parser.add_argument("output_root", type=Path, help="Path to domain model root (e.g. docs/domain-model)")
    parser.add_argument("--validate-only", action="store_true", help="Validate frozen contract only")
    args = parser.parse_args()

    root = args.output_root.resolve()
    if not root.is_dir():
        print(f"Error: not a directory: {root}", file=sys.stderr)
        return 1

    errors, warnings = validate_model(root)
    for w in warnings:
        print(f"warning: {w}", file=sys.stderr)
    if errors:
        print("Contract validation failed:", file=sys.stderr)
        for e in errors:
            print(f"  {e}", file=sys.stderr)
        return 1

    if args.validate_only:
        print(f"OK: {root} satisfies {CONTRACT_VERSION}")
        return 0

    render_warnings = render_all(root)
    for w in render_warnings:
        print(f"warning: {w}", file=sys.stderr)

    print(f"Rendered views under {root / 'views'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
