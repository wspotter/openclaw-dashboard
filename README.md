# OpenClaw Dashboard

Standalone modular dashboard for OpenClaw integrations, built with Vite + vanilla JavaScript/CSS.

## Features

- Runtime template engine (`templates/*.template.json`)
- Adaptive tile density layout
  - 1-4 tiles: large cards
  - 5-9 tiles: medium cards
  - 10-20 tiles: compact cards + detail panel
  - 20+ tiles: category-grouped sections (collapsed)
- Live health and metric polling with hard 5-second fetch timeout
- Search/filter bar for larger dashboards
- Keyboard navigation (arrows to move focus, Enter to open details)
- OpenClaw skill CLI for tile management (`skill/dashboard_manager.py`)

## Quick Start

```bash
npm install
npm run dev
```

Dashboard runs at `http://localhost:5173`.

## Template Runtime Loading

Templates are loaded at runtime from the top-level `templates/` directory through Vite middleware routes:

- `GET /api/templates` -> discover template files
- `GET /api/templates/_schema.json` -> template meta-schema
- `GET /api/templates/<file>` -> template JSON
- `GET /api/config/dashboard.config.json` -> active tile instance config

Add a new `*.template.json` file under `templates/` and the dashboard auto-discovers it on the next definition polling cycle (15s) or by pressing **Refresh**.

## Directory Layout

- `src/core/` - runtime engine (config loader, template engine, health checker, layout engine, tile manager)
- `src/components/` - renderers for tile modes, detail panel, status badge, category groups
- `src/utils/` - timeout-safe fetch and jq-lite evaluator
- `src/styles/` - design tokens, grid, tile, and panel CSS
- `templates/` - integration templates
- `config/` - tile instance config
- `skill/` - OpenClaw skill docs and CLI manager

## CLI Manager

```bash
python3 skill/dashboard_manager.py list
python3 skill/dashboard_manager.py add --template comfyui --id comfyui-lab --set host=localhost --set port=8188
python3 skill/dashboard_manager.py remove --id comfyui-lab
python3 skill/dashboard_manager.py status
python3 skill/dashboard_manager.py refresh --sync-missing
```

## Notes

- No external CDN dependencies.
- Fetches are timeout-bounded at 5 seconds.
- JS uses relative/web paths only; no absolute filesystem paths in frontend code.
