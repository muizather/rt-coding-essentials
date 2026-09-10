# refinement-log.template.json

Append-only audit trail. Never truncate; archive old engagements by rotating file if huge.

```json
{
  "$schema": "ddd-domain-model/refinement-log/v1",
  "platform_name": "",
  "entries": [
    {
      "id": "0001",
      "timestamp": "",
      "phase": "0-initialize|1-discover|2-context-map|3-deep-dive|4-refine",
      "action": "",
      "artifacts_touched": [],
      "evidence": [
        {
          "mcp_tool": "",
          "project": "",
          "target": "",
          "mode": "",
          "finding": ""
        }
      ],
      "confidence_delta": "",
      "open_questions_added": [],
      "open_questions_resolved": [],
      "notes": ""
    }
  ]
}
```

Evidence entries use the [canonical schema](../../README.md#canonical-evidence-schema). Always include `finding`.

## action examples

- `initialized platform manifest for 6 repos`
- `proposed context analytics-etl from architecture cluster`
- `mapped api-gateway → master-data as customer-supplier via grpc`
- `added aggregate ImportBatch to analytics-etl`
- `deprecated term inlet; superseded by data-catalog batch`
