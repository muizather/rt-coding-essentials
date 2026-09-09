---
name: awe-remember
description: >-
  Capture project knowledge the user just stated (invariants, gotchas, house
  style) into the codebase-memory ADR store. Use when they say remember this,
  this is knowledge, we always/never do X, or similar.
---

# awe-remember

**Purpose.** Persist **tribal knowledge** that is not in the AST. The code graph maps files and calls; this stores decisions and invariants via `manage_adr`.

## Procedure

1. **Memory MCP required.** If `manage_adr` is missing, STOP and tell them to enable codebase-memory on the AWE plugin.
2. Confirm the repo is indexed (`list_projects` / `index_status`); index if needed.
3. Restate the knowledge in one or two sentences and ask them to confirm if it was ambiguous. Do not invent extra policy.
4. `manage_adr` **get** / **sections** for this project. If an ADR already covers the topic, **set_sections** / update that document. Otherwise create one with a clear title (e.g. "Staging bucket is shared — do not run integration tests against it").
5. Ground the write in the real repo when you can (`search_graph` / paths). No secrets, no tokens, no `.env` values.
6. Do **not** add AWE plugin rules, do **not** write `40-awe-project-custom.mdc` unless they asked to add a **project** Cursor rule in **this** repo.
7. Optional committed markdown under `docs/` **only if they asked**.
8. Tell them the ADR title and that it applies to this project graph only.

## Exit criteria

- Knowledge is in `manage_adr` for **this** repo; user can see the title/summary.
