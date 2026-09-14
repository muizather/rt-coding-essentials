# Code graph bootstrap

Required before architecture. Codebase-memory MCP tools (`list_projects`, `index_repository`, `index_status`, `search_graph`, `get_architecture`) must be present from **any** namespace. If a user-level server already works, do **not** enable a second plugin copy (shared-process / daemon clash).

## 1. Discover the git family

Read `.cursor/state/awe-discovered.json` → `gitRepos[]` (session-start writes it). If missing, scan:

- Workspace has `.git` → one project (that root). Install the plugin **in that folder**. `/awe-run` works. There is no architect/platform parent folder to create.
- Workspace has **no** `.git` but child directories contain `.git` (depth 1) → **family**. Each child is its own project. Open the parent only when you have several clones and want one ticket across them.
- **Never** call `index_repository` on a parent folder that is not itself a git repo.
- **Never** index only the child that resembles a previously indexed path (e.g. `platform/nestjs` vs `/var/www/html/ipromo_nestjs`). Match `list_projects` by **`root_path`**.

## 2. Derive ignores (do not ask the human)

For each family member, **fingerprint** — not a full tree walk:

1. Top-level directory names and rough sizes (`du -sh *` is enough).
2. Manifest markers: `composer.json`, `package.json`, `go.mod`, `pyproject.toml`, `Gemfile`, CMS/config files at the root.
3. Existing `.gitignore`.

Then **decide** what is third-party, generated, build output, media/uploads, database dumps, or secrets. Union that with `.gitignore`. Write a `.cbmignore` (gitignore syntax) **only for gaps** gitignore does not already cover. MCP already skips `.git`, `node_modules`, and gitignored paths.

Record the skip list under `awe-discovered.json` → `graph.ignoresByRepo`. Do **not** put skip choices in `open-questions.md`. If a directory cannot be classified at all, skip it and log why — still do not interview.

Never read `.env*`, `*.pem`, `auth.json`, or other secret files; listing their names as skip patterns is enough.

## 3. Index

- **Mode:** `full`. Never `fast` for bootstrap. Never omit `mode`.
- **Order:** one `index_repository` at a time. Wait until it finishes. Parallel index hangs machines.
- Skip a member only when `index_status` for that exact `root_path` is already `ready`.
- After every in-scope member is ready, if there are **two or more**, run **one** `index_repository` with `mode: "cross-repo-intelligence"` and `target_projects` set to **those** project keys (not `"*"` unless the human asked to link every graph on the machine).

Write `awe-discovered.json` → `graph: { mode, projects[], crossRepo, at }`.

## 4. Later runs

If `root_path` is ready, do not full-reindex (the watcher keeps it fresh). Re-run cross-repo-intelligence only when the member set changes.
