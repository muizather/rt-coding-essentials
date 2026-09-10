#!/usr/bin/env python3
"""Fill aggregate root and entity attributes from persistence/SQL evidence."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4] / "docs" / "domain-model"
TODAY = "2026-07-08"

# context_slug -> aggregate name -> {root_attrs, entities: {entity_name: attrs}}
PATCHES: dict[str, dict[str, dict]] = {
    "shared-reference-data": {
        "TerritoryMapping": {
            "root": [
                "item_manufacturer_id",
                "territory_type_id",
                "channel_id",
                "subchannel_id",
                "logic_id",
                "failure_handling",
            ],
            "entities": {
                "territory_mapping_logic": [
                    "priority",
                    "where_clause",
                    "description",
                    "territory_mapping_config_id",
                ],
                "territory": ["name", "territory_type_id", "parent_territory_id"],
            },
        },
        "BuyingSubgroup": {
            "root": [
                "name",
                "total_stores",
                "total_sales",
                "sales_territory_id",
                "buying_group_id",
                "business_segment_id",
                "division_id",
                "reporting_rollup_1",
                "reporting_rollup_2",
                "reporting_rollup_3",
                "member_id",
            ],
            "entities": {
                "buying_group": ["name"],
            },
        },
    },
    "analytics-etl": {
        "ImportBatch": {
            "root": [
                "data_catalog_id",
                "created",
                "processed",
                "batch_type",
                "file_date",
            ],
        },
        "ProcessingFailure": {
            "root": [
                "transaction_date",
                "extended_price",
                "data",
                "import_batch_id",
                "created",
                "customer_name",
                "failure_code_id",
            ],
            "entities": {
                "mars_processing_failure_history": [
                    "failure_category",
                    "details",
                    "created",
                ],
            },
        },
        "WholesaleDailySales": {
            "root": [
                "mars_distributor_id",
                "mars_vendor_warehouse_id",
                "transaction_date",
                "invoice_number",
                "item_id",
                "wholesale_units",
                "wholesale_gsv",
                "extended_price",
                "mars_item_map_id",
                "mars_vendor_map_id",
                "_inlet_id",
                "shipment_type",
                "line_number",
                "wholesale_nsv",
                "wholesale_cases",
            ],
        },
        "ProcessingIssueResolution": {
            "root": ["data", "status", "created", "last_updated", "result"],
        },
    },
    "operations-console": {
        "WarehouseOperationsSession": {
            "root": ["failure_code_description", "brand_filter", "date_range"],
            "entities": {
                "warehouse_issue_row": [
                    "pipeline_id",
                    "pipeline_name",
                    "details",
                    "min_trans_date",
                    "max_trans_date",
                    "total_extended_price",
                    "failure_code_id",
                    "count",
                    "clients",
                ],
                "warehouse_resolution": [
                    "type",
                    "email",
                    "customer_id",
                    "warehouse_id",
                    "warehouse_template_id",
                    "pipeline_id",
                    "created",
                    "total_score",
                    "update_address",
                    "status",
                ],
            },
        },
        "TerritoryMappingAdmin": {
            "root": ["config_payload", "logic_payload"],
        },
        "UploadPipelineAdmin": {
            "root": ["display_name", "status", "next_run", "last_run"],
        },
        "CatalogBrowser": {
            "root": [
                "data_source",
                "data_type",
                "aggregation_level",
                "batch_id",
                "status",
            ],
        },
    },
    "file-ingestion": {
        "UploadPipeline": {
            "root": ["display_name", "status", "source", "publish_data"],
            "entities": {
                "pipeline_file": [
                    "size",
                    "modified",
                    "catalog_id",
                    "processing_status",
                ],
                "pipeline_error": [
                    "error_message",
                    "source_filename",
                    "created",
                ],
            },
        },
        "SourceFileBatch": {
            "root": [
                "data_source",
                "data_type",
                "record_count",
                "format",
                "s3_bucket",
            ],
            "entities": {
                "raw_archive": ["s3_key", "filename", "byte_size", "uploaded_at"],
                "clean_archive": [
                    "s3_key",
                    "filename",
                    "record_count",
                    "converted_at",
                ],
            },
        },
        "VendorPipelineConfig": {
            "root": [
                "pipeline_name",
                "publish_data",
                "source",
                "ignore_files",
                "allowed_extensions",
            ],
        },
    },
    "data-catalog": {
        "CatalogEntry": {
            "root": [
                "url",
                "data_source",
                "data_type",
                "sys_env",
                "aggregation_level",
                "file_format",
                "format_version",
                "status",
                "created",
                "other_data",
            ],
        },
        "PubHubJob": {
            "root": [
                "job_type",
                "schedule",
                "last_run",
                "next_run",
                "ph_data_source",
                "ph_data_type",
                "ph_aggregation_level",
                "active",
                "run_now",
                "created",
            ],
        },
    },
    "rebate-calculation": {
        "RebateProgram": {
            "root": ["channel", "quarter", "year", "status", "close_date"],
        },
        "TransactionApproval": {
            "root": [
                "approval_key",
                "status",
                "payment_approval_id",
                "created",
                "status_updated",
            ],
            "entities": {
                "payment_approval_signer": [
                    "reviewer_id",
                    "status",
                    "rejection_reason",
                    "approval_key",
                    "payment_approval_id",
                    "status_updated",
                    "created",
                ],
            },
        },
        "PaymentBatch": {
            "root": [
                "payment_date",
                "status",
                "total_amount",
                "approval_email_sent",
            ],
        },
    },
    "platform-infrastructure": {
        "ReplicationTopology": {
            "root": [
                "subscriber_host",
                "publisher_host",
                "slot_name",
                "enabled",
            ],
            "entities": {
                "replication_publication": [
                    "table_names",
                    "all_tables",
                    "inserts",
                    "updates",
                    "deletes",
                ],
            },
        },
        "ProvisioningPlaybook": {
            "root": ["role_path", "playbook_name", "inventory_group"],
        },
    },
}


def apply_patches(path: Path) -> bool:
    data = json.loads(path.read_text(encoding="utf-8"))
    slug = data.get("context_slug", "")
    patches = PATCHES.get(slug)
    if not patches:
        return False

    changed = False
    for agg in data.get("aggregates", []):
        spec = patches.get(agg.get("name"))
        if not spec:
            continue
        root = agg.get("aggregate_root", {})
        if spec.get("root") and root.get("attributes") != spec["root"]:
            root["attributes"] = spec["root"]
            changed = True
        ent_map = spec.get("entities", {})
        for ent in agg.get("entities", []):
            attrs = ent_map.get(ent.get("name"))
            if attrs is not None and ent.get("attributes") != attrs:
                ent["attributes"] = attrs
                changed = True

    if changed:
        data["last_updated"] = TODAY
        path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return changed


def main() -> None:
    touched = []
    for path in sorted((ROOT / "contexts").glob("*/aggregates.json")):
        if apply_patches(path):
            touched.append(str(path.relative_to(ROOT)))
            print("updated", path.relative_to(ROOT))
    print(f"Done: {len(touched)} files")


if __name__ == "__main__":
    main()
