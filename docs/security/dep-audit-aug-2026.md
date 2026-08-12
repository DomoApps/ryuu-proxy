# Security Remediation Plan — ryuu-proxy — August 2026

Audit date: 2026-08-12
Branch: `security/dep-audit-aug-2026`
Tooling: `pnpm audit`, GitHub Dependabot alerts

---

## Executive Summary

`ryuu-proxy` sits in the middle of the chain. Most of its production vulnerability exposure comes
transitively from `ryuu-client` (undici CVEs). Its own direct dependencies are largely clean.
Dev tooling carries several HIGH alerts (postcss, brace-expansion, js-yaml) that are isolated to
the build/test pipeline. The primary production fix is upgrading `ryuu-client` once that package
publishes its security patch release.

---

## Vulnerabilities

### 1. `undici` — Transitive via `ryuu-client` — CRITICAL PRIORITY (production)

Current path: `ryuu-proxy > ryuu-client > undici@7.24.7`
Required: `ryuu-client` pinned to a version that uses `undici>=7.29.0`

| Advisory | Severity | CVE | Summary | Fixed in |
|---|---|---|---|---|
| Dependabot #330 | HIGH | — | Cross-user info disclosure and parse-time crash via degenerate private Cache-Control directives | undici 7.29.0 |
| Dependabot #334 | MEDIUM | — | CRLF injection via blob-like body type property | undici 7.29.0 |
| Dependabot #333 | MEDIUM | — | Cookie attribute injection via unsanitized domain in Set-Cookie | undici 7.29.0 |
| Dependabot #332 | MEDIUM | — | Cross-user info disclosure via whitespace in Cache-Control | undici 7.29.0 |
| Dependabot #331 | MEDIUM | — | Downstream response desynchronization via retry interceptor | undici 7.29.0 |

Full list of inherited undici alerts: see domoapps-client plan — all apply here transitively.

**Impact on ryuu-proxy:** ryuu-proxy uses ryuu-client to make authenticated requests to Domo APIs
(proxying app API calls through the dev server). The undici HTTP request vulnerabilities are
directly in that path.

**Change required:**

Once `ryuu-client@5.0.1` (security patch) is published:

```json
"ryuu-client": "^5.0.1"
```

Then run:

```bash
pnpm update ryuu-client
pnpm audit --audit-level=high
```

**Breaking change risk:** NONE. ryuu-client's semver contract is unchanged; this is a patch bump
in that package.

---

### 2. `js-yaml` — Transitive via dev tooling (vitest chain) — HIGH (dev only)

Current version: `4.1.0`
Required version: `>=4.3.1`

| Advisory | Severity | Summary | Fixed in |
|---|---|---|---|
| Dependabot #341 | HIGH | Quadratic CPU consumption in `!!omap` resolution — CVE-2026-59870 fix not backported | 4.3.1 |
| Dependabot #319 | HIGH | YAML merge-key chains force quadratic CPU consumption | 4.3.0 |

**Impact:** Dev tooling only (vitest/build pipeline). Not shipped in the proxy middleware.

**Fix:** Upgrade vitest and related tools, or add a pnpm override:

```json
"pnpm": {
  "overrides": {
    "js-yaml": ">=4.3.1"
  }
}
```

---

### 3. `postcss` — Transitive via `vitest > vite` — HIGH/MEDIUM (dev only)

| Advisory | Severity | Summary | Fixed in |
|---|---|---|---|
| Dependabot #327/326 | HIGH | Path traversal via sourceMappingURL leading to arbitrary .map file read | 8.5.18 |
| Dependabot #324/323 | HIGH | Arbitrary file read via sourceMappingURL in CSS comments | 8.5.12 |
| Dependabot #343/342 | MEDIUM | Incomplete fix — still reads arbitrary .map files when `from` is unset | 8.5.23 |

**Impact:** Dev tooling only.

**Fix:** pnpm override:

```json
"pnpm": {
  "overrides": {
    "postcss": ">=8.5.23"
  }
}
```

---

### 4. `brace-expansion` — Transitive via dev tooling — HIGH (dev only)

| Advisory | Severity | Summary | Fixed in |
|---|---|---|---|
| Dependabot #328 | HIGH | DoS via unbounded expansion length causing OOM crash | 2.1.3 |
| Dependabot #335 | HIGH | Same pattern (different semver range) | 1.1.17 |
| Dependabot #321 | HIGH | DoS via exponential-time expansion of consecutive non-expanding `{}` groups | 1.1.16 |

**Fix:** pnpm override targeting the specific version in use:

```json
"pnpm": {
  "overrides": {
    "brace-expansion@1": ">=1.1.17",
    "brace-expansion@2": ">=2.1.3"
  }
}
```

---

### 5. `axios` — Transitive (check origin) — MEDIUM

Several Dependabot alerts reference `axios@<1.18.0`:

| Advisory | Severity | Summary | Fixed in |
|---|---|---|---|
| Dependabot #317 | MEDIUM | Prototype pollution gadgets can alter axios request construction | 1.18.0 |
| Dependabot #316 | MEDIUM | Nested axios option objects can consume polluted prototype values | 1.18.0 |

**Investigation needed:** ryuu-proxy does not directly depend on axios. Confirm the dependency
path with `pnpm why axios`. If it's coming from an older version of ryuu-client bundled in the
lock file, upgrading ryuu-client to 5.0.1 (which uses undici instead of axios) resolves this.
If it surfaces from another path, add a pnpm override.

---

## Implementation Plan

### Step 1: Wait for ryuu-client security patch

This is a hard dependency. Do not merge this branch until `ryuu-client@5.0.1` is published.

### Step 2: Upgrade ryuu-client

```bash
pnpm update ryuu-client@^5.0.1
pnpm audit --audit-level=high
```

### Step 3: Add pnpm overrides for dev dep vulns

Add to `package.json`:

```json
"pnpm": {
  "overrides": {
    "postcss": ">=8.5.23",
    "brace-expansion@1": ">=1.1.17",
    "brace-expansion@2": ">=2.1.3",
    "js-yaml": ">=4.3.1"
  }
}
```

Reinstall and recheck:

```bash
pnpm install
pnpm audit
```

### Step 4: Investigate axios

```bash
pnpm why axios
```

If the path is through ryuu-client, the upgrade above resolves it. If not, add:

```json
"axios": ">=1.18.0"
```

to the overrides block.

### Step 5: Run tests

```bash
pnpm test
```

Verify proxy middleware behavior against a local Domo dev server (if available).

---

## Downstream Effects

| Package | Effect |
|---|---|
| `domoapps-cli` | Transitively receives the undici fix once ryuu-proxy and ryuu-client are updated and published. |

No API surface changes. ryuu-proxy's exported middleware interface is unchanged.
domoapps-cli does not need code changes — only `pnpm update @domoinc/ryuu-proxy` after publish.

---

## Version Bump After Fix

After all changes are verified:

```
5.1.0 → 5.1.1
```

Publish to npm with the `latest` tag.
