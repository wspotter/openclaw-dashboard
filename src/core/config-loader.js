import { fetchJson } from '../utils/fetcher.js';

const DASHBOARD_CONFIG_ENDPOINT = '/api/config/dashboard.config.json';

function ensureObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

export async function loadDashboardConfig() {
  const rawConfig = await fetchJson(DASHBOARD_CONFIG_ENDPOINT);

  if (!ensureObject(rawConfig)) {
    throw new Error('Dashboard config must be an object.');
  }

  const instances = Array.isArray(rawConfig.instances) ? rawConfig.instances : [];

  return {
    version: typeof rawConfig.version === 'string' ? rawConfig.version : '1.0',
    metadata: ensureObject(rawConfig.metadata) ? rawConfig.metadata : {},
    instances,
  };
}
