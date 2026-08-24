/**
 * Vitest setup file for integration tests.
 * Loads integration/.env before any test runs so env vars are available
 * to the test files without requiring a shell-level dotenv wrapper.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, '.env');

if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const raw = trimmed.slice(eqIdx + 1).trim();
    const val = raw.replace(/^["']|["']$/g, '');
    // Honour env vars already set in the shell (shell wins over file).
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
}
