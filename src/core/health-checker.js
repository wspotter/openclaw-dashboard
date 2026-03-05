import { evaluateJq } from '../utils/jq-lite.js';
import { fetchJson, fetchWithTimeout } from '../utils/fetcher.js';

function joinRelative(base, childPath) {
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedPath = childPath.startsWith('/') ? childPath : `/${childPath}`;
  return `${normalizedBase}${normalizedPath}`;
}

function resolveEndpoint(config, endpointPath) {
  if (!endpointPath) {
    return '';
  }

  if (/^https?:\/\//.test(endpointPath)) {
    return endpointPath;
  }

  if (typeof config.base_url === 'string' && config.base_url.trim()) {
    const base = config.base_url.trim();
    if (/^https?:\/\//.test(base)) {
      return new URL(endpointPath, base).toString();
    }
    return joinRelative(base, endpointPath);
  }

  const protocol = config.protocol || 'http';
  const host = config.host || 'localhost';
  const port = config.port ? `:${config.port}` : '';
  return `${protocol}://${host}${port}${endpointPath}`;
}

function toRequestPath(endpoint) {
  if (!endpoint) {
    return endpoint;
  }

  if (/^https?:\/\//.test(endpoint)) {
    return `/api/proxy?target=${encodeURIComponent(endpoint)}`;
  }

  return endpoint;
}

function normalizeMetricValue(value, metricType) {
  if (metricType === 'number') {
    const numValue = Number(value);
    return Number.isFinite(numValue) ? numValue : 0;
  }

  if (metricType === 'relative_time') {
    const minutes = Number(value);
    if (Number.isFinite(minutes)) {
      if (minutes < 1) {
        return 'just now';
      }
      if (minutes < 60) {
        return `${Math.floor(minutes)}m ago`;
      }
      const hours = Math.floor(minutes / 60);
      return `${hours}h ago`;
    }
  }

  return value;
}

export class HealthChecker {
  async checkHealth(tile) {
    const healthCheck = tile.health_check ?? {};
    const method = healthCheck.method || 'GET';
    const endpoint = resolveEndpoint(tile.config ?? {}, healthCheck.path || '');
    const requestPath = toRequestPath(endpoint);

    if (!requestPath) {
      return {
        status: 'unknown',
        latency_ms: null,
        error: 'No health endpoint configured.',
      };
    }

    const startedAt = performance.now();

    try {
      const response = await fetchWithTimeout(requestPath, { method }, 5000);
      const latency = Math.round(performance.now() - startedAt);
      const expected = Number(healthCheck.expect_status || 200);

      if (!response.ok || response.status !== expected) {
        return {
          status: response.status >= 500 ? 'offline' : 'warning',
          latency_ms: latency,
          error: `Expected status ${expected}, got ${response.status}`,
        };
      }

      return {
        status: 'online',
        latency_ms: latency,
        error: null,
      };
    } catch (error) {
      return {
        status: 'offline',
        latency_ms: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async collectMetric(tile, metricDefinition) {
    const source = metricDefinition.source ?? {};
    const method = source.method || 'GET';
    const endpoint = resolveEndpoint(tile.config ?? {}, source.path || '');

    if (!endpoint) {
      return {
        id: metricDefinition.id,
        label: metricDefinition.label,
        value: '--',
        type: metricDefinition.type || 'string',
        error: 'No metric endpoint configured.',
      };
    }

    const requestPath = toRequestPath(endpoint);

    try {
      const payload = await fetchJson(requestPath, { method }, 5000);
      const extracted = source.jq ? evaluateJq(source.jq, payload) : payload;
      const normalized = normalizeMetricValue(extracted, metricDefinition.type);

      return {
        id: metricDefinition.id,
        label: metricDefinition.label,
        value: normalized,
        type: metricDefinition.type || 'string',
        error: null,
      };
    } catch (error) {
      return {
        id: metricDefinition.id,
        label: metricDefinition.label,
        value: '--',
        type: metricDefinition.type || 'string',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async pollTile(tile) {
    const health = await this.checkHealth(tile);
    const metrics = await Promise.all((tile.metrics ?? []).map((metric) => this.collectMetric(tile, metric)));

    return {
      status: health.status,
      latency_ms: health.latency_ms,
      error: health.error,
      checked_at: new Date().toISOString(),
      metrics,
    };
  }
}
