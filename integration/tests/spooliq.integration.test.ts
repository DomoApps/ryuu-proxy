/**
 * spool-iq integration tests
 *
 * Validates ryuu-proxy against spool-iq's real Domo app and datasets.
 * This exercises the full proxy pipeline with multi-dataset SQL queries —
 * the same workload the app runs in production.
 *
 * Requires:
 *   - DOMO_INSTANCE set in integration/.env
 *   - `domo login` already done for that instance
 *   - spool-iq repo at ~/dev/spool-iq with a valid .tmp/manifest.json
 *
 * Run:  pnpm run test:integration
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Server } from 'node:http';
import { Proxy } from '../../src/index.js';

// ─── locate spool-iq manifest ─────────────────────────────────────────────────

const SPOOLIQ_ROOT = join(homedir(), 'dev', 'spool-iq');
const SPOOLIQ_MANIFEST_PATH = join(SPOOLIQ_ROOT, '.tmp', 'manifest.json');

const hasInstance = !!process.env.DOMO_INSTANCE;
const hasManifest = existsSync(SPOOLIQ_MANIFEST_PATH);
const SHOULD_SKIP = !hasInstance || !hasManifest;

if (!hasInstance) {
  console.warn('\n⚠  spool-iq tests skipped — DOMO_INSTANCE not set in integration/.env\n');
} else if (!hasManifest) {
  console.warn(
    `\n⚠  spool-iq tests skipped — no manifest found at ${SPOOLIQ_MANIFEST_PATH}\n` +
      `   Run \`da apply-manifest\` or \`domo publish\` from ~/dev/spool-iq first.\n`
  );
}

// ─── test config ─────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.SPOOLIQ_INTEGRATION_PORT ?? '4322', 10);

// ─── helpers ─────────────────────────────────────────────────────────────────

async function postSql(alias: string, sql: string) {
  const res = await fetch(`http://localhost:${PORT}/sql/v1/${alias}`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: sql,
  });
  return res;
}

async function getData(alias: string) {
  return fetch(`http://localhost:${PORT}/data/v1/${alias}`);
}

async function bodyText(res: Response) {
  try {
    return await res.clone().text();
  } catch {
    return '(could not read body)';
  }
}

// ─── test suite ───────────────────────────────────────────────────────────────

(SHOULD_SKIP ? describe.skip : describe)('spool-iq integration tests', () => {
  let server: Server;

  beforeAll(async () => {
    const manifest = JSON.parse(readFileSync(SPOOLIQ_MANIFEST_PATH, 'utf-8'));

    console.info(`\n  Using spool-iq manifest: id=${manifest.id} proxyId=${manifest.proxyId}`);

    // Use the same Proxy class and pattern spool-iq's setupProxy.js uses.
    const proxy = new Proxy({ manifest });
    proxy.onError = (err: any, res: any) => {
      res.statusCode = err?.status ?? err?.statusCode ?? 500;
      res.end(err?.message ?? 'Proxy error');
    };

    const app = express();
    app.use(proxy.express());

    await new Promise<void>((resolve, reject) => {
      server = app.listen(PORT, resolve);
      server.once('error', reject);
    });

    // Wait for proxy to resolve the domain URL via getEnvironment.
    await new Promise((r) => setTimeout(r, 2000));

    // Quick smoke test — log the result so failures are immediately obvious.
    const probe = await fetch(`http://localhost:${PORT}/data/v1/Filaments`);
    if (!probe.ok) {
      const text = await probe.text();
      console.warn(`\n⚠  Diagnostic: GET /data/v1/Filaments → HTTP ${probe.status}\n   ${text}\n`);
    } else {
      console.info(`✓  Diagnostic: GET /data/v1/Filaments → HTTP ${probe.status} (proxy is healthy)`);
    }
  }, 60_000);

  afterAll(() => {
    server?.close();
  });

  // ── /data endpoint ────────────────────────────────────────────────────────

  describe('/data/v1/Filaments', () => {
    it('returns filament rows with expected columns', async () => {
      const res = await getData('Filaments');
      const body = await bodyText(res);

      expect(res.status, `Domo responded: ${body}`).toBe(200);

      const rows = JSON.parse(body) as Record<string, unknown>[];
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBeGreaterThan(0);

      const first = rows[0];
      expect(first).toHaveProperty('filament_id');
      expect(first).toHaveProperty('name');
      expect(first).toHaveProperty('color_hex');
    });
  });

  // ── /sql endpoint — core regression (issue #88) ──────────────────────────

  describe('/sql/v1/Filaments  (issue #88 regression — POST with body)', () => {
    it('SELECT * LIMIT 5 returns columns + rows', async () => {
      const res = await postSql('Filaments', 'SELECT * FROM Filaments LIMIT 5');
      const body = await bodyText(res);

      expect(res.status, `Domo responded: ${body}`).toBe(200);

      const parsed = JSON.parse(body) as Record<string, unknown>;
      expect(Array.isArray(parsed.columns)).toBe(true);
      expect(Array.isArray(parsed.rows)).toBe(true);
      expect((parsed.rows as unknown[]).length).toBeLessThanOrEqual(5);
    });

    it('SELECT with WHERE clause returns filtered rows', async () => {
      const sql = `SELECT filament_id, name, color_hex FROM Filaments WHERE color_hex IS NOT NULL LIMIT 10`;
      const res = await postSql('Filaments', sql);
      const body = await bodyText(res);

      expect(res.status, `Domo responded: ${body}`).toBe(200);

      const parsed = JSON.parse(body) as Record<string, unknown>;
      expect(Array.isArray(parsed.rows)).toBe(true);
    });

    it('forwards explicit content-length without breaking the request (regression check)', async () => {
      const sql = `SELECT COUNT(*) AS total FROM Filaments`;
      const res = await fetch(`http://localhost:${PORT}/sql/v1/Filaments`, {
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
      expect((parsed.rows as unknown[][]).length).toBe(1);
    });
  });

  // ── cross-dataset SQL ────────────────────────────────────────────────────

  describe('/sql/v1 — cross-dataset queries', () => {
    it('queries FilamentProperties and returns expected columns', async () => {
      const sql = `SELECT filament_id, property_key, display_value FROM FilamentProperties LIMIT 5`;
      const res = await postSql('FilamentProperties', sql);
      const body = await bodyText(res);

      expect(res.status, `Domo responded: ${body}`).toBe(200);

      const parsed = JSON.parse(body) as Record<string, unknown>;
      expect(Array.isArray(parsed.columns)).toBe(true);
    });

    it('queries Properties dataset', async () => {
      const sql = `SELECT property_key, label FROM Properties ORDER BY display_order LIMIT 5`;
      const res = await postSql('Properties', sql);
      const body = await bodyText(res);

      expect(res.status, `Domo responded: ${body}`).toBe(200);

      const parsed = JSON.parse(body) as Record<string, unknown>;
      expect(Array.isArray(parsed.rows)).toBe(true);
    });
  });
});
