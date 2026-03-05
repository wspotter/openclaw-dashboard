# openclaw-dashboard

Manage dashboard tile instances and template-backed integrations for `openclaw-dashboard`.

## Purpose
This skill lets Ollie (or a human operator) manage dashboard tiles without editing JavaScript:
- list active tiles
- add a tile from an existing template
- remove tiles
- validate template/config health
- refresh dashboard metadata timestamp

## Command
Run the manager from the project root:

```bash
python3 skill/dashboard_manager.py <command> [options]
```

## Subcommands

### `list`
Show configured tile instances from `config/dashboard.config.json`.

```bash
python3 skill/dashboard_manager.py list
```

### `add`
Create a new tile instance from a template.

```bash
python3 skill/dashboard_manager.py add --template comfyui --id comfyui-lab --name "ComfyUI Lab" --set host=10.0.0.100 --set port=8188
```

### `remove`
Delete a tile instance by ID.

```bash
python3 skill/dashboard_manager.py remove --id comfyui-lab
```

### `status`
Check template/config consistency (orphans, unconfigured templates, duplicate IDs).

```bash
python3 skill/dashboard_manager.py status
```

### `refresh`
Touch metadata timestamp; optionally auto-add missing templates.

```bash
python3 skill/dashboard_manager.py refresh --sync-missing
```

## Notes
- Templates are loaded from `templates/*.template.json` at runtime.
- The dashboard auto-discovers new template files and renders tiles with defaults when no explicit instance exists.
- `add` writes a durable instance entry so names/config overrides persist across reloads.
