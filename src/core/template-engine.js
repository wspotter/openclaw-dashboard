import { fetchJson } from '../utils/fetcher.js';

const SCHEMA_ENDPOINT = '/api/templates/_schema.json';
const TEMPLATE_LIST_ENDPOINT = '/api/templates';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneObject(value) {
  return JSON.parse(JSON.stringify(value));
}

function typeMatches(value, expectedType) {
  if (expectedType === 'array') {
    return Array.isArray(value);
  }
  if (expectedType === 'object') {
    return isObject(value);
  }
  if (expectedType === 'number') {
    return typeof value === 'number' && Number.isFinite(value);
  }
  return typeof value === expectedType;
}

function getByPath(source, dottedPath) {
  if (!dottedPath) {
    return undefined;
  }

  return dottedPath.split('.').reduce((current, segment) => {
    if (current === null || current === undefined) {
      return undefined;
    }
    return current[segment];
  }, source);
}

function fillTemplateString(templateString, context) {
  if (typeof templateString !== 'string') {
    return templateString;
  }

  return templateString.replace(/\{([^}]+)\}/g, (_, token) => {
    if (token === 'input') {
      return '{input}';
    }

    const resolved = getByPath(context, token);
    if (resolved === undefined || resolved === null) {
      return '';
    }

    return String(resolved);
  });
}

function applyConfigDefaults(configSchema, configOverrides = {}) {
  const resolved = {};

  for (const [key, schemaEntry] of Object.entries(configSchema ?? {})) {
    if (isObject(configOverrides) && configOverrides[key] !== undefined) {
      resolved[key] = configOverrides[key];
      continue;
    }

    if (schemaEntry && schemaEntry.default !== undefined) {
      resolved[key] = schemaEntry.default;
      continue;
    }

    resolved[key] = null;
  }

  for (const [key, value] of Object.entries(configOverrides ?? {})) {
    if (!(key in resolved)) {
      resolved[key] = value;
    }
  }

  return resolved;
}

function createResolvedAction(action, context) {
  return {
    ...cloneObject(action),
    url: fillTemplateString(action.url, context),
    command: fillTemplateString(action.command, context),
  };
}

export class TemplateEngine {
  constructor() {
    this.schema = null;
  }

  async loadSchema() {
    if (this.schema) {
      return this.schema;
    }

    this.schema = await fetchJson(SCHEMA_ENDPOINT);
    return this.schema;
  }

  async discoverTemplateFiles() {
    const payload = await fetchJson(TEMPLATE_LIST_ENDPOINT);
    return Array.isArray(payload.templates) ? payload.templates : [];
  }

  async loadTemplateFile(fileName) {
    return fetchJson(`/api/templates/${encodeURIComponent(fileName)}`);
  }

  validateTemplate(template, schema) {
    if (!isObject(template)) {
      return { valid: false, reason: 'Template must be an object.' };
    }

    const required = Array.isArray(schema.required_fields) ? schema.required_fields : [];
    for (const field of required) {
      if (template[field] === undefined || template[field] === null) {
        return {
          valid: false,
          reason: `Missing required field: ${field}`,
        };
      }
    }

    const typeMap = isObject(schema.field_types) ? schema.field_types : {};
    for (const [field, expectedType] of Object.entries(typeMap)) {
      if (template[field] === undefined || template[field] === null) {
        continue;
      }
      if (!typeMatches(template[field], expectedType)) {
        return {
          valid: false,
          reason: `Invalid field type for ${field}. Expected ${expectedType}.`,
        };
      }
    }

    return { valid: true, reason: '' };
  }

  async loadAllTemplates() {
    const schema = await this.loadSchema();
    const files = await this.discoverTemplateFiles();
    const loadedTemplates = [];
    const errors = [];

    const results = await Promise.all(
      files.map(async (fileName) => {
        try {
          const template = await this.loadTemplateFile(fileName);
          const validation = this.validateTemplate(template, schema);
          if (!validation.valid) {
            return {
              fileName,
              template: null,
              error: validation.reason,
            };
          }

          return {
            fileName,
            template,
            error: null,
          };
        } catch (error) {
          return {
            fileName,
            template: null,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );

    for (const result of results) {
      if (result.template) {
        loadedTemplates.push({
          ...result.template,
          __file_name: result.fileName,
        });
      } else {
        errors.push({
          fileName: result.fileName,
          reason: result.error,
        });
      }
    }

    return {
      templates: loadedTemplates,
      errors,
    };
  }

  createTileModel(template, instance, index = 0) {
    const resolvedConfig = applyConfigDefaults(template.config_schema, instance.config ?? {});
    const tileId = instance.id || `${template.template_id}-${index + 1}`;
    const name = instance.name || template.display_name;

    const context = {
      config: resolvedConfig,
      tile: {
        id: tileId,
        name,
      },
    };

    const resolvedActions = (template.actions ?? []).map((action) => createResolvedAction(action, context));

    return {
      id: tileId,
      template_id: template.template_id,
      template_file: template.__file_name,
      name,
      description: template.description,
      category: instance.category || template.category,
      icon: template.icon,
      refresh_interval_seconds:
        Number(instance.refresh_interval_seconds) || Number(template.refresh_interval_seconds) || 30,
      config: resolvedConfig,
      health_check: cloneObject(template.health_check),
      metrics: cloneObject(template.metrics ?? []),
      actions: resolvedActions,
      source: instance.source || (instance.id ? 'configured' : 'autodiscovered'),
      state: {
        status: 'unknown',
        last_checked_at: null,
        latency_ms: null,
        metrics: {},
        metric_history: {},
        errors: [],
      },
    };
  }

  buildTileModels(templates, dashboardConfig) {
    const templatesById = new Map();
    for (const template of templates) {
      templatesById.set(template.template_id, template);
    }

    const instancesByTemplate = new Map();
    for (const instance of dashboardConfig.instances ?? []) {
      if (!instance || !instance.template_id) {
        continue;
      }
      const key = instance.template_id;
      if (!instancesByTemplate.has(key)) {
        instancesByTemplate.set(key, []);
      }
      instancesByTemplate.get(key).push(instance);
    }

    const tiles = [];

    for (const template of templates) {
      const matchedInstances = instancesByTemplate.get(template.template_id) ?? [];
      if (!matchedInstances.length) {
        tiles.push(this.createTileModel(template, { id: template.template_id }, 0));
        continue;
      }

      matchedInstances.forEach((instance, index) => {
        tiles.push(this.createTileModel(template, instance, index));
      });
    }

    for (const instance of dashboardConfig.instances ?? []) {
      if (!instance || !instance.template_id) {
        continue;
      }
      if (templatesById.has(instance.template_id)) {
        continue;
      }

      tiles.push({
        id: instance.id || `orphan-${instance.template_id}`,
        template_id: instance.template_id,
        name: instance.name || instance.template_id,
        description: 'Template missing',
        category: instance.category || 'unknown',
        icon: '⚠️',
        refresh_interval_seconds: 30,
        config: instance.config ?? {},
        health_check: { method: 'GET', path: '', expect_status: 200 },
        metrics: [],
        actions: [],
        source: 'orphaned-config',
        state: {
          status: 'warning',
          last_checked_at: null,
          latency_ms: null,
          metrics: {},
          metric_history: {},
          errors: ['Template file not found for configured tile.'],
        },
      });
    }

    return tiles;
  }
}
