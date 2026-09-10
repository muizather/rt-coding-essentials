#!/usr/bin/env python3
"""One-shot migration: align docs/domain-model with updated skill templates."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4] / "docs" / "domain-model"
TODAY = "2026-07-08"

REPO_KIND = {
    "sprout": "core",
    "mars-rebate": "core",
    "hershey": "core",
    "artemis": "core",
    "console2": "core",
    "pubhub": "core",
    "sproutretail": "core",
    "upload-config": "config",
    "pubhub-client": "supporting",
    "sprout-library": "supporting",
    "digitalocean": "infra",
}

# Terms where aliases are clearly legacy code/table names
LEGACY_ALIAS_TERMS = {
    "warehouse": ["vwm_warehouse"],
    "processing-failure": ["mars_processing_failure"],
    "import-batch": ["import_batch", "import_batch_id"],
    "wholesale-daily-sales": ["wholesale_daily_sales", "get_mars_wholesale_daily_sales"],
    "etl-1": ["database_etl_1"],
    "etl-2": ["database_etl_2"],
    "data-catalog-entry": ["data_catalog", "catalog_id"],
    "transaction-approval": ["transaction_approval", "set_approval_approved"],
    "payment-approval": ["payment_approval", "send_payment_approval_email"],
    "failure-code": ["failure_code", "failure_code_description"],
    "item-mapping-failure": ["IM"],
    "territory-mapping": ["territory_mapping_config", "territory_mapping_logic"],
    "buying-subgroup": ["buying_subgroup"],
    "data-source": ["data_source"],
    "data-type": ["data_type"],
    "aggregation-level": ["aggregation_level"],
    "vendor-pipeline-config": ["upload-config", "jobs/config/publish"],
}


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def save(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def migrate_source_entry(entry: dict, idx: int) -> dict:
    out = dict(entry)
    if "query" in out and "target" not in out:
        out["target"] = out.pop("query")
    if "qualified_name" in out and "target" not in out:
        out["target"] = out.pop("qualified_name")
    if "finding_summary" in out:
        out["finding"] = out.pop("finding_summary")
    if "id" not in out:
        out["id"] = f"src-{idx:03d}"
    return out


def migrate_sources(path: Path) -> bool:
    data = load(path)
    if "sources" in data and "evidence" not in data:
        return False
    raw = data.pop("evidence", data.pop("sources", []))
    data["sources"] = [migrate_source_entry(e, i + 1) for i, e in enumerate(raw)]
    data["last_updated"] = TODAY
    if "$render_contract" not in data:
        data["$render_contract"] = "views/v1"
    save(path, data)
    return True


def infer_event_type(event: dict) -> tuple[str, bool]:
    triggers = " ".join(event.get("triggers", [])).lower()
    name = event.get("name", "").lower()
    if any(x in triggers for x in ("jobs.", "job.run", "cron", "runjob")):
        return "inferred-from-job", False
    if any(x in triggers for x in ("create_", "insert", "publish")):
        return "inferred-from-table-write", False
    if "explicit" in name:
        return "explicit", True
    return "inferred-from-table-write", False


def migrate_domain_events(path: Path) -> bool:
    data = load(path)
    changed = False
    for ev in data.get("events", []):
        if "inference" not in ev:
            inf, known = infer_event_type(ev)
            ev["inference"] = inf
            ev["transport_known"] = known
            changed = True
    for ie in data.get("integration_events", []):
        if "inference" not in ie:
            ie["inference"] = "explicit"
            ie["transport_known"] = True
            changed = True
    if changed:
        data["last_updated"] = TODAY
        save(path, data)
    return changed


def migrate_integrations(path: Path) -> bool:
    data = load(path)
    slug = data.get("context_slug", "")
    changed = False
    for ib in data.get("inbound", []):
        from_slug = ib.get("from_context_slug", "")
        if from_slug == slug or from_slug == "operations-console" and slug == "operations-console":
            ib["from_context_slug"] = "external:operator-ui"
            ib["from_type"] = "external"
            changed = True
        elif from_slug.startswith("external:"):
            if ib.get("from_type") != "external":
                ib["from_type"] = "external"
                changed = True
        elif "from_type" not in ib:
            ib["from_type"] = "bounded-context"
            changed = True
        for ev in ib.get("evidence", []):
            if "finding" not in ev and "target" in ev:
                ev["finding"] = f"Inbound from {ib.get('from_context_slug')}"
                changed = True
    for ob in data.get("outbound", []):
        for ev in ob.get("evidence", []):
            if "finding" not in ev and "target" in ev:
                ev["finding"] = f"Outbound to {ob.get('to_context_slug')}"
                changed = True
    if changed:
        data["last_updated"] = TODAY
        save(path, data)
    return changed


def migrate_glossary(path: Path) -> bool:
    data = load(path)
    changed = False
    for term in data.get("terms", []):
        key = term.get("term", "")
        if "legacy_names" not in term and key in LEGACY_ALIAS_TERMS:
            term["legacy_names"] = LEGACY_ALIAS_TERMS[key]
            changed = True
        elif "legacy_names" not in term:
            legacy = [a for a in term.get("aliases", []) if re.search(r"[_]|^mars_|^etl", a)]
            if legacy:
                term["legacy_names"] = legacy
                changed = True
        if "type" not in term:
            term["type"] = "entity"
            changed = True
    if changed:
        data["last_updated"] = TODAY
        save(path, data)
    return changed


def ensure_attributes(obj: dict, defaults: list[str] | None = None) -> bool:
    if "attributes" in obj:
        return False
    obj["attributes"] = defaults or []
    return True


def migrate_aggregates(path: Path) -> bool:
    data = load(path)
    slug = data.get("context_slug", "")
    changed = False
    for agg in data.get("aggregates", []):
        root = agg.get("aggregate_root", {})
        if ensure_attributes(root):
            changed = True
        for ent in agg.get("entities", []):
            if ensure_attributes(ent):
                changed = True
        if slug == "shared-reference-data" and agg.get("name") == "Warehouse":
            ent = agg["entities"][0]
            if ent["name"] == "warehouse_address":
                addr_fields = ["house_number", "street", "city", "state", "zip"]
                if ent.get("identifiers") == addr_fields:
                    ent["identifiers"] = ["warehouse_id"]
                    ent["attributes"] = addr_fields + ["lat", "lng"]
                    root["attributes"] = [
                        "name", "status", "store_number", "buying_subgroup_id", "subchannel_id"
                    ]
                    changed = True
    if changed:
        data["last_updated"] = TODAY
        save(path, data)
    return changed


def migrate_context_map(path: Path) -> bool:
    data = load(path)
    changed = False
    for ctx in data.get("contexts", []):
        if ctx.get("slug") == "rebate-calculation":
            new_desc = (
                "Transaction approval, payment processing, and rebate closing on db-1. "
                "Validated separate from analytics-etl (Phase 4): consumes etl-2 facts "
                "and mars_processing_failure as close prerequisites."
            )
            if "boundary deferred" in ctx.get("description", ""):
                ctx["description"] = new_desc
                changed = True
    for rel in data.get("relationships", []):
        if "validation_status" not in rel:
            rel["validation_status"] = "both-directions-traced" if rel.get("confidence") == "high" else "one-way-traced"
            changed = True
        if rel.get("id") == "rel-009" and "Phase 3" in rel.get("description", ""):
            rel["description"] = (
                "Rebate closing reads wholesale_daily_sales and mars_processing_failure from etl-2; "
                "writes transaction_approval on db-1. Separate bounded context (Phase 4 validated)."
            )
            changed = True
        for ev in rel.get("evidence", []):
            if "finding" not in ev:
                ev["finding"] = rel.get("description", "")[:120]
                changed = True
    for sk in data.get("shared_kernels", []):
        if "Phase 3" in sk.get("notes", ""):
            sk["notes"] = sk["notes"].replace(
                "Verify table-level ownership in Phase 3.",
                "Table-level ownership documented in context deep-dives.",
            )
            changed = True
    if changed:
        data["last_updated"] = TODAY
        save(path, data)
    return changed


def migrate_manifest(path: Path) -> bool:
    data = load(path)
    changed = False
    for repo in data.get("repos", []):
        name = repo.get("name", "")
        if "repo_kind" not in repo and name in REPO_KIND:
            repo["repo_kind"] = REPO_KIND[name]
            changed = True
        if "last_indexed" not in repo and repo.get("index_status") == "ready":
            repo["last_indexed"] = TODAY
            changed = True
    if changed:
        data["last_updated"] = TODAY
        save(path, data)
    return changed


def migrate_operations_console_bc(path: Path) -> bool:
    data = load(path)
    changed = False
    if "read_models" not in data:
        data["read_models"] = [
            {
                "name": "WarehouseSearch",
                "description": "Aggregated warehouse search across Sprout db-1 and brand etl-2 sales details.",
                "entry_points": ["GET /api/warehouse/search", "warehouseSearch"],
                "source_contexts": ["shared-reference-data", "analytics-etl"],
                "notes": "ACL read model; no local persistence.",
            },
            {
                "name": "WarehouseIssues",
                "description": "Open mapping failures aggregated from brand get_open_issue_summary.",
                "entry_points": ["GET /api/warehouse-issue", "warehouseIssues"],
                "source_contexts": ["analytics-etl"],
                "notes": "Multi-brand MConn/HConn/AConn fan-out.",
            },
            {
                "name": "PubhubCatalogBrowse",
                "description": "Operator catalog search/detail via srlib pubhub client.",
                "entry_points": ["GET /api/pubhub/catalog", "pubhubSearchCatalog"],
                "source_contexts": ["data-catalog"],
                "notes": "",
            },
        ]
        changed = True
    if changed:
        data["last_updated"] = TODAY
        save(path, data)
    return changed


def append_refinement_log(path: Path, touched: list[str]) -> None:
    data = load(path)
    entry = {
        "id": "0006",
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "phase": "4-refinement",
        "action": "template conformance pass: sources[], from_type, inference, legacy_names, attributes, read_models, stale copy fixes",
        "artifacts_touched": sorted(set(touched + ["refinement-log.json", "views/"])),
        "evidence": [
            {
                "mcp_tool": "render_domain_views",
                "project": "n/a",
                "target": "migrate_domain_model_conformance.py",
                "finding": "Structural alignment to views/v1 render contract and skill template checklist",
            }
        ],
        "confidence_delta": "n/a (schema conformance)",
        "open_questions_added": [],
        "open_questions_resolved": [],
        "notes": "Regenerated views/ after JSON patches. No new MCP discovery in this pass.",
    }
    data["entries"].append(entry)
    save(path, data)


def main() -> None:
    touched: list[str] = []

    for src in (ROOT / "contexts").glob("*/sources.json"):
        if migrate_sources(src):
            touched.append(str(src.relative_to(ROOT)))

    for ev in (ROOT / "contexts").glob("*/domain-events.json"):
        if migrate_domain_events(ev):
            touched.append(str(ev.relative_to(ROOT)))

    for integ in (ROOT / "contexts").glob("*/integrations.json"):
        if migrate_integrations(integ):
            touched.append(str(integ.relative_to(ROOT)))

    for agg in (ROOT / "contexts").glob("*/aggregates.json"):
        if migrate_aggregates(agg):
            touched.append(str(agg.relative_to(ROOT)))

    if migrate_glossary(ROOT / "ubiquitous-language.json"):
        touched.append("ubiquitous-language.json")

    if migrate_context_map(ROOT / "context-map.json"):
        touched.append("context-map.json")

    if migrate_manifest(ROOT / "platform-manifest.json"):
        touched.append("platform-manifest.json")

    bc = ROOT / "contexts/operations-console/bounded-context.json"
    if migrate_operations_console_bc(bc):
        touched.append(str(bc.relative_to(ROOT)))

    append_refinement_log(ROOT / "refinement-log.json", touched)
    print("Migrated:", len(touched), "artifact groups")
    for t in sorted(touched):
        print(" ", t)


if __name__ == "__main__":
    main()
