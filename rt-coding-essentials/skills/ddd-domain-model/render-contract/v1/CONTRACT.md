# Render contract `views/v1`

Machine-readable domain model JSON is the **source of truth**. The renderer at
[`scripts/render_domain_views.py`](../../scripts/render_domain_views.py) projects JSON into
human-readable Markdown + Mermaid under `{output_root}/views/`.

## Versioning rule

**Bump the contract version** (`views/v1` → `views/v2`) when changing any **frozen** field path in
[`manifest.json`](manifest.json). When bumping:

1. Add `render-contract/v2/` with updated manifest.
2. Update `render_domain_views.py` to support the new version.
3. Update artifact templates to set `"$render_contract": "views/v2"`.
4. Migrate existing `{output_root}` JSON or provide a migration script.

Agents and humans may extend JSON with **extensible** fields without a contract bump.

## Frozen vs extensible

| Category | Rule |
|----------|------|
| **Frozen** | Listed in `manifest.json` → `frozen_paths`. Renderer validates before generating views. |
| **Frozen when present** | Listed in `frozen_when_present` — validated only if parent array is non-empty. |
| **Extensible** | Everything else (`evidence`, `notes`, `persistence_hints`, …). Agents may add freely. |

Diagram-enriched fields (entities, value_objects, consumers) are **extensible** in v1: the renderer
uses them when present but does not require them. Tightening to frozen requires a contract bump.

## Artifact marker

Every renderable JSON file must include:

```json
"$render_contract": "views/v1"
```

If absent, the renderer assumes `views/v1` and prints a warning.

## Frozen paths by artifact

See [`manifest.json`](manifest.json) for the authoritative list. Summary:

### `context-map.json`

`platform_name`, `contexts[].{slug,name,type,status,confidence}`,
`relationships[].{upstream_slug,downstream_slug,pattern,integration.mechanism,status,confidence}`

### `ubiquitous-language.json`

`terms[].{term,definition,context_slugs,status,confidence}`

### `contexts/{slug}/bounded-context.json`

`slug`, `name`, `description`, `type`, `status`, `responsibilities`

### `contexts/{slug}/aggregates.json`

`context_slug`, `aggregates[].name`, `aggregates[].aggregate_root.name`

Extensible (used by diagrams when present): `identifiers`, `attributes`, `entities`, `value_objects`,
`invariants`, `commands`, `queries`, `state_machine`

### `contexts/{slug}/domain-events.json`

`context_slug`, `events[].{name,past_tense,emitted_by_aggregate,status}`

Frozen when `integration_events` non-empty: `integration_events[].{name,source_context,target_context}`

### `contexts/{slug}/integrations.json`

`context_slug`, `inbound[].{from_context_slug,mechanism}`, `outbound[].{to_context_slug,mechanism}`

## Validation and render

```bash
# Validate only
python3 .cursor/skills/ddd-domain-model/scripts/render_domain_views.py docs/domain-model --validate-only

# Generate views/
python3 .cursor/skills/ddd-domain-model/scripts/render_domain_views.py docs/domain-model
```

Exit code 1 if frozen validation fails.

## Agent autonomy vs contract stability

- Agents **patch extensible fields** anytime (discovery, evidence, notes).
- Agents **must not rename or retype frozen paths** without a contract version bump and renderer update.
- Skill/template improvements that only add extensible fields do not require a contract bump.
- New diagram types or required fields → bump contract + update script in one PR.
