# DEV_REPORT.md

## Project
OpenClaw Dashboard (`<path_to_repo>`)

## Date
2026-03-05

## Architecture Decisions

### 1) Runtime template loading through Vite middleware (not build-time bundling)
I implemented a Vite middleware API in `vite.config.js` to serve top-level `templates/` and `config/` JSON files at runtime:
- `GET /api/templates`
- `GET /api/templates/_schema.json`
- `GET /api/templates/:file`
- `GET /api/config/dashboard.config.json`

This keeps template discovery dynamic and satisfies the requirement that adding a `*.template.json` file should not require dashboard code edits.

### 2) Componentized vanilla JS architecture
I separated responsibilities into:
- `src/core/`: data/runtime orchestration
- `src/components/`: renderers and UI widgets
- `src/utils/`: transport and jq-lite evaluator
- `src/styles/`: visual system + responsive behavior

This keeps the app maintainable without frameworks.

### 3) Evented tile lifecycle manager
`TileManager` extends `EventTarget` and emits `tiles-updated` events. UI subscribes once and re-renders from state snapshots. This is a lightweight observer pattern suitable for vanilla JS.

### 4) Layout engine with explicit density thresholds
`layout-engine.js` enforces deterministic thresholds:
- `<=4`: large
- `<=9`: medium
- `<=20`: compact
- `>20`: compact + grouped by category

This prevents ad-hoc layout branching in rendering code.

### 5) Health + metrics polling pipeline
`health-checker.js` performs per-tile health checks and metric extraction on intervals from each template (`refresh_interval_seconds`).
- All browser fetches route through `fetchWithTimeout` / `fetchJson` wrappers with hard `5000ms` timeout.
- Metric extraction uses `jq-lite` to evaluate simple expressions like `.queue_pending | length`.

### 6) CORS-safe reachability through local proxy
For absolute upstream endpoints, the browser requests `/api/proxy?target=...`, and server middleware performs the outbound call with a 5-second timeout. This avoids browser CORS failures against local LAN integrations.

### 7) Skill-driven config mutation
`skill/dashboard_manager.py` is a standalone CLI for template-backed instance management:
- `add`
- `remove`
- `list`
- `status`
- `refresh`

It writes to `config/dashboard.config.json`, applies template defaults, and supports `--set key=value` overrides.

## Design Patterns Used

- Observer/Event pattern: `TileManager` -> `tiles-updated` event stream.
- Component renderer pattern: tile density-specific renderers (`tile-large`, `tile-medium`, `tile-compact`).
- Strategy-like layout policy: density/grouping chosen by `layout-engine` thresholds.
- Contract-first template model: `_schema.json` + runtime validator in `TemplateEngine`.

## Template Engine: Runtime Validate + Load Flow

1. Fetch schema from `/api/templates/_schema.json`
2. Fetch template file list from `/api/templates`
3. Fetch each template JSON dynamically
4. Validate required fields + field types against schema contract
5. Merge with `dashboard.config.json` instances
6. Auto-create default tile models for templates without explicit instance entries

Result: dropping in a new template file is enough to make it discoverable and renderable.

## Layout Engine Threshold Logic

`computeLayout(tiles, searchTerm)` executes:
1. Filter tiles by name/category/template id
2. Determine density mode by visible tile count
3. If visible count > 20, group by category and collapse groups by default
4. Return render plan object (`density`, `grouped`, `groups`, `filteredTiles`)

## Tradeoffs

### Chosen
- Runtime file API middleware instead of static `public/` templates:
  - Pros: true runtime discovery from top-level `templates/`
  - Cons: depends on Vite server middleware for file access

- Simple jq-lite evaluator instead of full jq implementation:
  - Pros: no external dependency, deterministic behavior
  - Cons: limited expression support

- Full re-render on tile updates:
  - Pros: straightforward state/UI sync in vanilla JS
  - Cons: less efficient than keyed diff/virtual DOM at larger scale

- Mock integration endpoints in Vite middleware:
  - Pros: guaranteed local live polling behavior during development
  - Cons: not a substitute for real integration contract tests

### Considered But Not Chosen
- React/Vue component model: rejected by project constraints.
- Build-time `import.meta.glob` for templates: rejected because templates must be runtime-loaded.
- WebSocket streaming for health data: overkill for current scope; polling is enough.

## Integration Notes

### Health checks and unreachable behavior
- Health check result states: `online`, `warning`, `offline`, `unknown`
- Unreachable endpoints are marked `offline` with error text shown in detail panel
- Metric fetch failures preserve card rendering and show fallback value (`--`)

### Skill manager interaction with config
`dashboard_manager.py` loads templates + config and mutates `config/dashboard.config.json` safely:
- `add`: merges template defaults + overrides
- `remove`: deletes by tile id
- `status`: detects orphans/duplicates/unconfigured templates
- `refresh`: updates metadata timestamp and optional sync of missing templates

### Auto-discovery behavior
- The dashboard polls template definitions every 15s in `TileManager`
- Manual refresh button triggers immediate reload
- Adding `*.template.json` appears in `/api/templates` immediately; UI picks it up on poll/refresh

## Known Limitations & Future Work

### Scale limitations
- Full DOM re-render per tile update can become expensive with very large tile counts and short intervals.
- Polling intervals are per tile; many high-frequency tiles can increase network/CPU churn.

### Future improvements
- Patch-based DOM updates keyed by tile id
- Adaptive polling backoff when integrations are offline
- Persisted UI preferences (collapsed groups, search query, sort order)
- Better action execution pipeline (server-side command runner with audit logs)

### Security considerations
- `/api/proxy` currently allows general http/https targets; production should restrict allowed hosts.
- Action commands are only displayed/prepared in UI, not executed directly in browser (intentional safety).
- Credential handling is intentionally out of frontend; templates/config should avoid secrets in plain JSON.

## Testing Done

### Commands run

1. `npm install`
- Result: dependencies installed, 0 vulnerabilities.

2. `npm run build`
- Result: build succeeded.
- Output summary: transformed modules and generated `dist/index.html`, JS, CSS assets.

3. `python3 skill/dashboard_manager.py list`
- Result: listed 5 configured starter tiles.

4. `python3 skill/dashboard_manager.py status`
- Result: 5 templates, 5 instances, 0 orphans, 0 duplicates.

5. `python3 skill/dashboard_manager.py add --template comfyui --id comfyui-lab ...`
- Result: tile added successfully.

6. `python3 skill/dashboard_manager.py remove --id comfyui-lab`
- Result: tile removed successfully.

7. `python3 skill/dashboard_manager.py refresh --sync-missing`
- Result: metadata refreshed, 0 missing templates to sync.

8. Dev server route validation
- Started server: `npm run dev -- --host 127.0.0.1 --port 5173`
- Checked:
  - `/` returns dashboard HTML shell
  - `/api/templates` returns starter template list
  - `/api/config/dashboard.config.json` returns active instances
  - `/api/mock/openclaw/health` returns online payload

9. Auto-discovery test
- Added temporary file: `templates/zzz-temp.template.json`
- `/api/templates` count increased from 5 -> 6
- Removed temp file after verification.

10. Layout threshold test (scripted)
- Counts tested: `0,1,4,5,9,10,20,21`
- Verified transitions:
  - 1/4 => large
  - 5/9 => medium
  - 10/20 => compact (not grouped)
  - 21 => compact + grouped

11. Malformed template validation test
- Added temporary `templates/malformed.template.json` with missing required fields.
- Executed `TemplateEngine.loadAllTemplates()` against live dev server.
- Result:
  - `templates_loaded 5`
  - `errors_count 1`
  - `has_malformed_error true`
- Removed temporary malformed template after validation.

### Edge cases covered
- `0` tiles (empty-state render path)
- `1` tile (large mode)
- `20+` tiles threshold logic (grouping at 21)
- Offline behavior path covered in code (timeouts/health fallback)
- Malformed template handling verified in runtime test (invalid template excluded and reported as loader error)

### Screenshots / visual proof
- Terminal/API outputs were captured during test commands.
- Browser screenshot capture was not produced in this session.
