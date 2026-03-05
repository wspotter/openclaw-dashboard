import { promises as fs } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const repoRoot = process.cwd();
const templatesDir = path.resolve(repoRoot, 'templates');
const configDir = path.resolve(repoRoot, 'config');
const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

function asJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  for (const [key, value] of Object.entries(jsonHeaders)) {
    res.setHeader(key, value);
  }
  res.end(JSON.stringify(payload, null, 2));
}

function safeResolve(baseDir, inputPath) {
  const sanitized = path.posix.normalize(`/${inputPath}`).replace(/^\//, '');
  const resolved = path.resolve(baseDir, sanitized);
  if (!resolved.startsWith(baseDir)) {
    throw new Error('Invalid path.');
  }
  return resolved;
}

async function listTemplateFiles() {
  const entries = await fs.readdir(templatesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.template.json'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function buildMockPayload(pathname) {
  const now = Date.now();
  const minuteSeed = Math.floor(now / 60000);
  const secondSeed = Math.floor(now / 1000);

  if (pathname === '/api/mock/comfyui/system_stats') {
    return { statusCode: 200, body: { uptime_seconds: 86400 + secondSeed, gpu_busy: true } };
  }

  if (pathname === '/api/mock/comfyui/queue') {
    const pendingCount = minuteSeed % 6;
    const runningCount = (minuteSeed + 1) % 2;
    return {
      statusCode: 200,
      body: {
        queue_pending: Array.from({ length: pendingCount }, (_, index) => ({ id: `p-${index + 1}` })),
        queue_running: Array.from({ length: runningCount }, (_, index) => ({ id: `r-${index + 1}` })),
      },
    };
  }

  if (pathname === '/api/mock/mailcow/api/v1/get/status') {
    return { statusCode: 200, body: { mailcow: 'ok' } };
  }

  if (pathname === '/api/mock/mailcow/api/v1/mailbox/stats') {
    return {
      statusCode: 200,
      body: {
        unread: 5 + (minuteSeed % 7),
        last_received_minutes: minuteSeed % 28,
        outbox_queued: minuteSeed % 4,
      },
    };
  }

  if (pathname === '/api/mock/openclaw/health') {
    return { statusCode: 200, body: { gateway: 'online' } };
  }

  if (pathname === '/api/mock/openclaw/sessions') {
    return {
      statusCode: 200,
      body: {
        active_sessions: 2 + (minuteSeed % 3),
        avg_latency_ms: 180 + (secondSeed % 40),
      },
    };
  }

  if (pathname === '/api/mock/openclaw/agents') {
    const statuses = ['online', 'online', 'online', minuteSeed % 9 === 0 ? 'warning' : 'online'];
    return {
      statusCode: 200,
      body: {
        agents: [
          { name: 'ollie', status: statuses[0] },
          { name: 'researcher', status: statuses[1] },
          { name: 'coder', status: statuses[2] },
          { name: 'writer', status: statuses[3] },
        ],
      },
    };
  }

  if (pathname === '/api/mock/delivery-hub/health') {
    return { statusCode: 200, body: { delivery_hub: 'healthy' } };
  }

  if (pathname === '/api/mock/delivery-hub/today') {
    const packagesToday = 120 + (minuteSeed % 35);
    return {
      statusCode: 200,
      body: {
        packages_today: packagesToday,
        revenue_today: Number((packagesToday * 2.5).toFixed(2)),
        top_driver: minuteSeed % 2 === 0 ? 'Masy' : 'Jeremy',
      },
    };
  }

  if (pathname === '/api/mock/voice/health') {
    return { statusCode: 200, body: { pipeline: 'ready' } };
  }

  if (pathname === '/api/mock/voice/status') {
    return {
      statusCode: 200,
      body: {
        listening: minuteSeed % 2 === 0,
        last_command_minutes: minuteSeed % 15,
        wake_word: 'hey_jarvis',
      },
    };
  }

  return null;
}

function dashboardApiPlugin() {
  return {
    name: 'openclaw-dashboard-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const requestUrl = new URL(req.url ?? '/', 'http://localhost');

          if (requestUrl.pathname === '/api/templates') {
            const templates = await listTemplateFiles();
            asJson(res, 200, { templates, count: templates.length });
            return;
          }

          if (requestUrl.pathname === '/api/templates/_schema.json') {
            const schemaPath = safeResolve(templatesDir, '_schema.json');
            const schemaText = await fs.readFile(schemaPath, 'utf8');
            asJson(res, 200, JSON.parse(schemaText));
            return;
          }

          if (requestUrl.pathname.startsWith('/api/templates/')) {
            const templateName = decodeURIComponent(requestUrl.pathname.replace('/api/templates/', ''));
            const templatePath = safeResolve(templatesDir, templateName);
            const templateText = await fs.readFile(templatePath, 'utf8');
            asJson(res, 200, JSON.parse(templateText));
            return;
          }

          if (requestUrl.pathname === '/api/config/dashboard.config.json') {
            const configPath = safeResolve(configDir, 'dashboard.config.json');
            const configText = await fs.readFile(configPath, 'utf8');
            asJson(res, 200, JSON.parse(configText));
            return;
          }

          if (requestUrl.pathname.startsWith('/api/mock/')) {
            const mock = buildMockPayload(requestUrl.pathname);
            if (!mock) {
              asJson(res, 404, { error: 'Unknown mock endpoint.' });
              return;
            }
            asJson(res, mock.statusCode, mock.body);
            return;
          }

          if (requestUrl.pathname === '/api/proxy') {
            const target = requestUrl.searchParams.get('target');
            if (!target) {
              asJson(res, 400, { error: 'Missing target parameter.' });
              return;
            }

            const parsedTarget = new URL(target);
            if (!['http:', 'https:'].includes(parsedTarget.protocol)) {
              asJson(res, 400, { error: 'Only http and https targets are allowed.' });
              return;
            }

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 5000);
            const method = req.method ?? 'GET';
            const hasBody = !['GET', 'HEAD'].includes(method.toUpperCase());
            let body;

            if (hasBody) {
              const chunks = [];
              for await (const chunk of req) {
                chunks.push(chunk);
              }
              body = Buffer.concat(chunks);
            }

            try {
              const proxied = await fetch(parsedTarget, {
                method,
                signal: controller.signal,
                body,
                headers: {
                  'content-type': req.headers['content-type'] ?? 'application/json',
                },
              });

              const payload = await proxied.text();
              clearTimeout(timer);

              res.statusCode = proxied.status;
              res.setHeader(
                'Content-Type',
                proxied.headers.get('content-type') ?? 'application/json; charset=utf-8',
              );
              res.setHeader('Cache-Control', 'no-store');
              res.end(payload);
              return;
            } catch (error) {
              clearTimeout(timer);
              asJson(res, 502, {
                error: 'Proxy request failed.',
                details: error instanceof Error ? error.message : String(error),
              });
              return;
            }
          }

          next();
        } catch (error) {
          asJson(res, 500, {
            error: 'Dashboard API middleware error.',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [dashboardApiPlugin()],
});
