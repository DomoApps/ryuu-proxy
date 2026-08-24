/**
 * Integration tests for ryuu-proxy
 *
 * These tests exercise the full proxy pipeline against a live Domo instance.
 * They require credentials and test-data to be configured in integration/.env
 * before running.  See integration/README.md for step-by-step setup.
 *
 * Run:  pnpm run test:integration
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { Proxy } from '../../src/index.js';

// ─── environment guard ────────────────────────────────────────────────────────

// DOMO_PROXY_ID is optional — if empty, the proxy calls createInstance(DOMO_ASSET_ID)
// to create a temporary instance with the correct dataset mapping.
const REQUIRED_VARS = ['DOMO_INSTANCE', 'DOMO_DATASET_ID', 'DOMO_ASSET_ID'] as const;
const missingVars = REQUIRED_VARS.filter((k) => !process.env[k]);
const SHOULD_SKIP = missingVars.length > 0;

if (SHOULD_SKIP) {
  console.warn(
    `\n⚠  Integration tests skipped — required env vars not set: ${missingVars.join(', ')}\n` +
      `   Copy integration/.env.example → integration/.env and fill in the values.\n` +
      `   See integration/README.md for setup instructions.\n`
  );
}

// ─── test config ─────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.INTEGRATION_PORT ?? '4321', 10);

// DOMO_DATASET_ALIAS must match the alias your card uses in its published manifest.
// Defaults to "sales" — set this if your card uses a different alias.
const ALIAS = process.env.DOMO_DATASET_ALIAS ?? 'sales';

// ─── helpers ─────────────────────────────────────────────────────────────────

async function get(path: string, init?: RequestInit) {
  const res = await fetch(`http://localhost:${PORT}${path}`, init);
  return res;
}

async function postSql(alias: string, sql: string) {
  return get(`/sql/v1/${alias}`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: sql,
  });
}

/** Read the response body for debugging — safe to call even on error responses. */
async function bodyText(res: Response): Promise<string> {
  try {
    return await res.clone().text();
  } catch {
    return '(could not read body)';
  }
}

// ─── test suite ───────────────────────────────────────────────────────────────

(SHOULD_SKIP ? describe.skip : describe)('ryuu-proxy integration tests', () => {
  let server: Server;

  // Build the manifest dynamically from env vars so the test env file is the
  // single source of truth and the repo never contains real IDs.
  const manifest = {
    name: 'ryuu-proxy-integration-test',
    version: '1.0.0',
    id: process.env.DOMO_ASSET_ID ?? '',
    // Empty string → falsy → proxy calls createInstance(manifest.id) to get a temp instance
    proxyId: process.env.DOMO_PROXY_ID || undefined,
    mapping: [
      {
        dataSetId: process.env.DOMO_DATASET_ID ?? '',
        alias: ALIAS,
        fields: [],
      },
    ],
  };

  beforeAll(async () => {
    // Mirror the exact setup pattern from the issue reporter and README examples
    // so these tests double as a real-world smoke test for the public API.
    const proxy = new Proxy({ manifest });
    const app = express();
    app.use(proxy.express());

    await new Promise<void>((resolve, reject) => {
      server = app.listen(PORT, resolve);
      server.once('error', reject);
    });

    // Give the proxy time to resolve the domainUrl via getEnvironment before
    // the first request arrives.  Typically ~500ms; allow up to 10 s for slow
    // instances.
    await new Promise((r) => setTimeout(r, 2000));

    // Diagnostic: probe the data endpoint and log exactly what Domo says.
    // This prints before any test runs so the output helps diagnose setup issues.
    const probe = await fetch(`http://localhost:${PORT}/data/v1/${ALIAS}`);
    if (!probe.ok) {
      const text = await probe.text();
      console.warn(
        `\n⚠  Diagnostic: GET /data/v1/${ALIAS} → HTTP ${probe.status}\n` +
          `   Domo response body: ${text}\n` +
          `   Check that your card's published manifest has alias "${ALIAS}" mapped.\n` +
          `   Set DOMO_DATASET_ALIAS in integration/.env if your alias differs.\n`
      );
    } else {
      console.info(`✓  Diagnostic: GET /data/v1/${ALIAS} → HTTP ${probe.status} (proxy is healthy)`);
    }
  }, 60_000);

  afterAll(() => {
    server?.close();
  });

  // ── /data endpoint ──────────────────────────────────────────────────────────

  describe('/data/v1/:alias', () => {
    it('returns the dataset rows as an array of objects', async () => {
      const res = await get(`/data/v1/${ALIAS}`);
      const body = await bodyText(res);

      expect(res.status, `Domo responded: ${body}`).toBe(200);

      const parsed = JSON.parse(body) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);

      // Each row should carry the CSV column names as keys.
      const first = parsed[0] as Record<string, unknown>;
      expect(first).toHaveProperty('Product');
      expect(first).toHaveProperty('Revenue');
    });
  });

  // ── /sql endpoint (regression: issue #88) ──────────────────────────────────

  describe('/sql/v1/:alias  (POST with body — issue #88 regression)', () => {
    it('returns query results for SELECT *', async () => {
      const res = await postSql(ALIAS, `SELECT * FROM ${ALIAS} LIMIT 5`);
      const body = await bodyText(res);

      expect(res.status, `Domo responded: ${body}`).toBe(200);

      const parsed = JSON.parse(body) as Record<string, unknown>;
      // Domo SQL response shape: { columns: string[], rows: unknown[][] }
      expect(Array.isArray(parsed.columns)).toBe(true);
      expect(Array.isArray(parsed.rows)).toBe(true);
      expect((parsed.rows as unknown[]).length).toBeLessThanOrEqual(5);
    });

    it('returns aggregated results for GROUP BY', async () => {
      const sql = `SELECT Product, SUM(Revenue) AS TotalRevenue FROM ${ALIAS} GROUP BY Product ORDER BY TotalRevenue DESC`;
      const res = await postSql(ALIAS, sql);
      const body = await bodyText(res);

      expect(res.status, `Domo responded: ${body}`).toBe(200);

      const parsed = JSON.parse(body) as Record<string, unknown>;
      expect(Array.isArray(parsed.rows)).toBe(true);
      expect((parsed.rows as unknown[]).length).toBeGreaterThan(0);
    });

    it('forwards content-length without leaking it upstream (issue #88 regression)', async () => {
      // Send the request exactly as a browser would — with an explicit
      // Content-Length header.  Before the fix in 5.1.2, passing both
      // content-length and transfer-encoding produced an HTTP/1.1-invalid
      // request that caused Domo to return 500.
      const sql = `SELECT COUNT(*) AS n FROM ${ALIAS}`;
      const res = await fetch(`http://localhost:${PORT}/sql/v1/${ALIAS}`, {
        method: 'POST',
        headers: {
          'content-type': 'text/plain',
          'content-length': String(Buffer.byteLength(sql, 'utf8')),
        },
        body: sql,
      });
      const body = await bodyText(res);

      expect(res.status, `Domo responded: ${body}`).toBe(200);
      const parsed = JSON.parse(body) as Record<string, unknown>;
      expect(Array.isArray(parsed.rows)).toBe(true);
    });
  });

  // ── non-Domo URLs ──────────────────────────────────────────────────────────

  describe('non-Domo URLs', () => {
    it('passes through to Express (returns 404 from the test server)', async () => {
      const res = await get('/some/local/path');
      // Express default — not intercepted by the proxy middleware
      expect(res.status).toBe(404);
    });
  });
});
