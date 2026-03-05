import { loadDashboardConfig } from './config-loader.js';
import { HealthChecker } from './health-checker.js';
import { TemplateEngine } from './template-engine.js';

function cloneState(value) {
  return JSON.parse(JSON.stringify(value));
}

function shallowEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class TileManager extends EventTarget {
  constructor(options = {}) {
    super();

    this.templateEngine = new TemplateEngine();
    this.healthChecker = new HealthChecker();
    this.tiles = [];
    this.pollTimers = new Map();
    this.definitionReloadTimer = null;
    this.options = {
      definitionReloadIntervalMs: options.definitionReloadIntervalMs ?? 15000,
    };
  }

  getTiles() {
    return cloneState(this.tiles);
  }

  emitUpdate(reason = 'update') {
    this.dispatchEvent(
      new CustomEvent('tiles-updated', {
        detail: {
          reason,
          tiles: this.getTiles(),
        },
      }),
    );
  }

  preserveRuntimeState(nextTiles) {
    const previousById = new Map(this.tiles.map((tile) => [tile.id, tile]));

    for (const tile of nextTiles) {
      const previous = previousById.get(tile.id);
      if (!previous) {
        continue;
      }

      tile.state = {
        ...tile.state,
        ...(previous.state ?? {}),
      };
    }

    return nextTiles;
  }

  async reloadDefinitions(reason = 'reload') {
    const dashboardConfig = await loadDashboardConfig();
    const loaded = await this.templateEngine.loadAllTemplates();
    const nextTiles = this.templateEngine.buildTileModels(loaded.templates, dashboardConfig);
    this.preserveRuntimeState(nextTiles);

    const changed = !shallowEqual(
      this.tiles.map((tile) => ({ id: tile.id, template: tile.template_id, config: tile.config })),
      nextTiles.map((tile) => ({ id: tile.id, template: tile.template_id, config: tile.config })),
    );

    this.tiles = nextTiles;

    if (changed) {
      this.startPolling();
      await this.refreshAll();
    }

    if (loaded.errors.length) {
      for (const tile of this.tiles) {
        tile.state.errors = tile.state.errors ?? [];
      }

      for (const error of loaded.errors) {
        const placeholder = this.tiles.find((tile) => tile.template_file === error.fileName);
        if (placeholder) {
          placeholder.state.errors.push(error.reason);
        }
      }
    }

    this.emitUpdate(reason);
  }

  async initialize() {
    await this.reloadDefinitions('initialize');
    await this.refreshAll();
    this.startDefinitionWatcher();
  }

  startDefinitionWatcher() {
    this.stopDefinitionWatcher();

    this.definitionReloadTimer = window.setInterval(async () => {
      try {
        await this.reloadDefinitions('definition-poll');
      } catch (error) {
        console.error('Failed to reload template definitions', error);
      }
    }, this.options.definitionReloadIntervalMs);
  }

  stopDefinitionWatcher() {
    if (this.definitionReloadTimer) {
      clearInterval(this.definitionReloadTimer);
      this.definitionReloadTimer = null;
    }
  }

  clearPolling() {
    for (const timer of this.pollTimers.values()) {
      clearInterval(timer);
    }
    this.pollTimers.clear();
  }

  startPolling() {
    this.clearPolling();

    for (const tile of this.tiles) {
      const intervalMs = Math.max(5000, Number(tile.refresh_interval_seconds || 30) * 1000);

      const timer = window.setInterval(async () => {
        await this.refreshTile(tile.id);
      }, intervalMs);

      this.pollTimers.set(tile.id, timer);
    }
  }

  async refreshAll() {
    await Promise.all(this.tiles.map((tile) => this.refreshTile(tile.id)));
  }

  async refreshTile(tileId) {
    const tile = this.tiles.find((entry) => entry.id === tileId);
    if (!tile) {
      return;
    }

    const result = await this.healthChecker.pollTile(tile);
    const metricMap = {};

    for (const metric of result.metrics) {
      metricMap[metric.id] = metric.value;

      if (!tile.state.metric_history[metric.id]) {
        tile.state.metric_history[metric.id] = [];
      }

      const historicalValue = typeof metric.value === 'number' ? metric.value : 0;
      tile.state.metric_history[metric.id].push(historicalValue);
      tile.state.metric_history[metric.id] = tile.state.metric_history[metric.id].slice(-24);
    }

    const metricErrors = result.metrics.filter((metric) => metric.error).map((metric) => `${metric.label}: ${metric.error}`);
    const errors = [...metricErrors];
    if (result.error) {
      errors.unshift(result.error);
    }

    tile.state = {
      ...tile.state,
      status: result.status,
      latency_ms: result.latency_ms,
      last_checked_at: result.checked_at,
      metrics: metricMap,
      errors,
    };

    this.emitUpdate('tile-refresh');
  }

  stop() {
    this.clearPolling();
    this.stopDefinitionWatcher();
  }
}
