#!/usr/bin/env python3
"""CLI manager for OpenClaw dashboard tile instances."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_DIR = ROOT / 'templates'
CONFIG_PATH = ROOT / 'config' / 'dashboard.config.json'


@dataclass
class TemplateRecord:
    file_name: str
    payload: dict[str, Any]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def load_json(path: Path, default: Any | None = None) -> Any:
    if not path.exists():
        if default is None:
            raise FileNotFoundError(f'Missing file: {path}')
        return default
    return json.loads(path.read_text(encoding='utf-8'))


def save_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + '\n', encoding='utf-8')


def ensure_config() -> dict[str, Any]:
    config = load_json(CONFIG_PATH, default={'version': '1.0', 'metadata': {}, 'instances': []})
    if not isinstance(config, dict):
        raise ValueError('dashboard.config.json must be a JSON object.')
    config.setdefault('version', '1.0')
    config.setdefault('metadata', {})
    config.setdefault('instances', [])
    if not isinstance(config['instances'], list):
        raise ValueError('dashboard.config.json instances must be an array.')
    return config


def load_templates() -> dict[str, TemplateRecord]:
    templates: dict[str, TemplateRecord] = {}
    for template_file in sorted(TEMPLATE_DIR.glob('*.template.json')):
        payload = load_json(template_file)
        template_id = payload.get('template_id')
        if not template_id:
            continue
        templates[template_id] = TemplateRecord(file_name=template_file.name, payload=payload)
    return templates


def defaults_from_schema(config_schema: dict[str, Any]) -> dict[str, Any]:
    defaults: dict[str, Any] = {}
    for key, schema in config_schema.items():
        if isinstance(schema, dict) and 'default' in schema:
            defaults[key] = schema['default']
        else:
            defaults[key] = None
    return defaults


def parse_scalar(raw_value: str) -> Any:
    lower = raw_value.lower()
    if lower in {'true', 'false'}:
        return lower == 'true'
    if lower in {'null', 'none'}:
        return None

    try:
        if raw_value.startswith('0') and raw_value != '0' and not raw_value.startswith('0.'):
            raise ValueError
        return int(raw_value)
    except ValueError:
        pass

    try:
        return float(raw_value)
    except ValueError:
        return raw_value


def parse_set_arguments(pairs: list[str]) -> dict[str, Any]:
    overrides: dict[str, Any] = {}
    for pair in pairs:
        if '=' not in pair:
            raise ValueError(f'Invalid --set pair: {pair}. Use key=value.')
        key, raw = pair.split('=', 1)
        key = key.strip()
        if not key:
            raise ValueError(f'Invalid --set key in pair: {pair}.')
        overrides[key] = parse_scalar(raw.strip())
    return overrides


def cmd_list(_: argparse.Namespace) -> int:
    config = ensure_config()
    instances = config['instances']

    if not instances:
        print('No tile instances configured.')
        return 0

    headers = ('ID', 'Template', 'Name')
    rows = [(inst.get('id', ''), inst.get('template_id', ''), inst.get('name', '')) for inst in instances]
    widths = [max(len(str(row[index])) for row in rows + [headers]) for index in range(3)]

    print('  '.join(headers[index].ljust(widths[index]) for index in range(3)))
    print('  '.join('-' * widths[index] for index in range(3)))
    for row in rows:
        print('  '.join(str(row[index]).ljust(widths[index]) for index in range(3)))

    return 0


def cmd_add(args: argparse.Namespace) -> int:
    templates = load_templates()
    config = ensure_config()

    template = templates.get(args.template)
    if not template:
        print(f'Template not found: {args.template}')
        return 1

    template_payload = template.payload
    instance_id = args.id

    if not instance_id:
        existing_count = sum(1 for inst in config['instances'] if inst.get('template_id') == args.template)
        instance_id = f'{args.template}-{existing_count + 1}'

    if any(inst.get('id') == instance_id for inst in config['instances']):
        print(f'Instance ID already exists: {instance_id}')
        return 1

    try:
        overrides = parse_set_arguments(args.set or [])
    except ValueError as error:
        print(str(error))
        return 1

    config_defaults = defaults_from_schema(template_payload.get('config_schema', {}))
    merged_config = {**config_defaults, **overrides}

    instance = {
        'id': instance_id,
        'template_id': args.template,
        'name': args.name or template_payload.get('display_name', args.template),
        'config': merged_config,
    }

    config['instances'].append(instance)
    config.setdefault('metadata', {})
    config['metadata']['updated_at'] = utc_now_iso()

    save_json(CONFIG_PATH, config)
    print(f'Added tile: {instance_id} ({args.template})')
    return 0


def cmd_remove(args: argparse.Namespace) -> int:
    config = ensure_config()
    before = len(config['instances'])
    config['instances'] = [inst for inst in config['instances'] if inst.get('id') != args.id]
    after = len(config['instances'])

    if before == after:
        print(f'Tile ID not found: {args.id}')
        return 1

    config.setdefault('metadata', {})
    config['metadata']['updated_at'] = utc_now_iso()
    save_json(CONFIG_PATH, config)
    print(f'Removed tile: {args.id}')
    return 0


def cmd_status(_: argparse.Namespace) -> int:
    templates = load_templates()
    config = ensure_config()

    instances = config['instances']
    configured_templates = {inst.get('template_id') for inst in instances if inst.get('template_id')}
    available_templates = set(templates.keys())

    orphans = [inst for inst in instances if inst.get('template_id') not in available_templates]
    missing_instances = sorted(available_templates - configured_templates)

    ids = [inst.get('id') for inst in instances]
    duplicate_ids = sorted({tile_id for tile_id in ids if tile_id and ids.count(tile_id) > 1})

    print(f'Templates available: {len(available_templates)}')
    print(f'Instances configured: {len(instances)}')
    print(f'Orphan instances: {len(orphans)}')
    print(f'Unconfigured templates: {len(missing_instances)}')
    print(f'Duplicate IDs: {len(duplicate_ids)}')

    if orphans:
        print('\nOrphan instances:')
        for inst in orphans:
            print(f"  - {inst.get('id', '<missing-id>')} -> {inst.get('template_id', '<missing-template>')}")

    if missing_instances:
        print('\nTemplates without explicit instance entries:')
        for template_id in missing_instances:
            print(f'  - {template_id}')

    if duplicate_ids:
        print('\nDuplicate tile IDs:')
        for tile_id in duplicate_ids:
            print(f'  - {tile_id}')

    return 1 if orphans or duplicate_ids else 0


def cmd_refresh(args: argparse.Namespace) -> int:
    templates = load_templates()
    config = ensure_config()
    config.setdefault('metadata', {})
    config['metadata']['updated_at'] = utc_now_iso()

    if args.sync_missing:
        configured_template_ids = {inst.get('template_id') for inst in config['instances'] if inst.get('template_id')}
        added = 0

        for template_id, template in templates.items():
            if template_id in configured_template_ids:
                continue

            payload = template.payload
            config['instances'].append(
                {
                    'id': template_id,
                    'template_id': template_id,
                    'name': payload.get('display_name', template_id),
                    'config': defaults_from_schema(payload.get('config_schema', {})),
                }
            )
            added += 1

        print(f'Refresh complete. Synced {added} missing template instances.')
    else:
        print('Refresh complete. Updated metadata timestamp.')

    save_json(CONFIG_PATH, config)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description='Manage OpenClaw dashboard tiles from template definitions.')
    subparsers = parser.add_subparsers(dest='command', required=True)

    list_parser = subparsers.add_parser('list', help='List configured tile instances.')
    list_parser.set_defaults(func=cmd_list)

    add_parser = subparsers.add_parser('add', help='Add a tile instance from a template ID.')
    add_parser.add_argument('--template', required=True, help='Template ID (for example: comfyui).')
    add_parser.add_argument('--id', help='Tile instance ID. Auto-generated if omitted.')
    add_parser.add_argument('--name', help='Display name override.')
    add_parser.add_argument(
        '--set',
        action='append',
        default=[],
        metavar='KEY=VALUE',
        help='Config override pair. Repeat for multiple values.',
    )
    add_parser.set_defaults(func=cmd_add)

    remove_parser = subparsers.add_parser('remove', help='Remove a tile instance by ID.')
    remove_parser.add_argument('--id', required=True, help='Tile ID to remove.')
    remove_parser.set_defaults(func=cmd_remove)

    status_parser = subparsers.add_parser('status', help='Validate template/config consistency.')
    status_parser.set_defaults(func=cmd_status)

    refresh_parser = subparsers.add_parser('refresh', help='Refresh config metadata and optionally sync missing templates.')
    refresh_parser.add_argument(
        '--sync-missing',
        action='store_true',
        help='Create config instances for templates not yet configured.',
    )
    refresh_parser.set_defaults(func=cmd_refresh)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return int(args.func(args))


if __name__ == '__main__':
    raise SystemExit(main())
