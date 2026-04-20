# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ryuu-proxy is a middleware library for local Domo App development. It intercepts API calls to Domo endpoints (`/data/v{d}`, `/sql/v{d}`, `/dql/v{d}`, `/domo/.../v{d}`, `/api/...`) and proxies authenticated requests to Domo services so developers can work locally against live Domo data.

Published as `@domoinc/ryuu-proxy`. ESM-only (`"type": "module"`) — relative TypeScript imports must use explicit `.js` extensions.

## Development Commands

- `pnpm run build` — clean `dist/` and compile TypeScript
- `pnpm test` — run the vitest suite once
- `pnpm run test:watch` — vitest in watch mode
- `pnpm run test:coverage` — vitest with coverage
- `pnpm run format` / `pnpm run format:check` — Prettier write / check (there is no separate lint script)
- `pnpm run clean` — wipe `node_modules` + `pnpm-lock.yaml` and reinstall

Run a single test file: `pnpm exec vitest run path/to/file.spec.ts`
Run a single test by name: `pnpm exec vitest run -t "test name"`

## Architecture

### Core Components

**Proxy Class** (`src/index.ts`)

- Public API surface; constructor takes `{ manifest, ... }`.
- `express()` returns Express/Connect middleware.
- `stream(req)` returns a readable stream for framework-agnostic use (Koa, Node `http`, etc.).
- Multipart/form-data requests are parsed with busboy and forwarded as FormData.
- Honors HTTP proxy env vars (`PROXY_HOST`, `PROXY_PORT`, `PROXY_USERNAME`, `PROXY_PASSWORD`) and `REACT_APP_`-prefixed variants.

**Transport Class** (`src/lib/Transport/index.ts`)

- Core proxying: builds axios request configs with proper headers, cookies, and OAuth tokens.
- `isDomoRequest()` gates which URLs are proxied.
- Merges existing cookies with OAuth tokens `_daatv1` / `_dartv1` when applicable.
- Pulls auth data from configstore populated by the Domo CLI.

**Utils** (`src/lib/utils/index.ts`)

- `getMostRecentLogin()` — reads the most recent session from `~/ryuu/*.json` and its configstore entry.
- `getOauthTokens()` — fetches scoped OAuth tokens for OAuth-enabled apps.
- `getProxyId()` — returns `manifest.proxyId` or a generated UUID fallback.

### Authentication Flow

1. Requires a prior `domo login` (Domo CLI).
2. Proxy reads the most recent session from `~/ryuu/`.
3. Retrieves refresh + dev tokens from configstore.
4. Creates a `ryuu-client` Domo client.
5. For OAuth-enabled apps, fetches scoped access/refresh tokens keyed by `proxyId`.
6. Injects auth via cookies + headers on every proxied request.

### Request Processing

1. `isDomoRequest()` matches Domo URL patterns.
2. Multipart requests stream files through busboy to a temp directory, then re-upload via FormData.
3. Standard requests build an axios config and proxy upstream.
4. `prepareHeaders()` sets referer, host, and cookie headers.
5. The upstream response is piped back to the client.

### ProxyId Mechanism

Apps using DQL, writeback, or OAuth require a `proxyId` in `manifest.json`:

- Ties the local dev environment to a specific published card instance.
- Extracted from the iframe URL of a published card (`//{proxyId}.domoapps.prodX.domo.com`).
- Used to look up scoped OAuth tokens in configstore.
- Falls back to a generated UUID if absent — sufficient for basic `/data` and `/sql` queries.

## Dependencies

Direct runtime deps: `ryuu-client`, `busboy`, `configstore`.
Peer: `express ^4.17.0 || ^5.0.0` (only needed when using `proxy.express()`).
`axios`, `tough-cookie`, and `axios-cookiejar-support` are pulled in transitively through `ryuu-client` and are not declared as direct dependencies.

## Error Handling

`DomoException` errors expose:

- `name: "DomoException"`
- `status` or `statusCode` — HTTP status
- `statusMessage` — description

Consumers should catch these in middleware to surface detailed errors.

## Releases

- `pnpm run release:production` — build and publish to npm (latest)
- `pnpm run release:beta` — build and publish under the `beta` dist-tag
- `pnpm run release:alpha` — build and publish under the `alpha` dist-tag

`prepublishOnly` runs `pnpm test` + `pnpm run build`. Version bumps use conventional commits via [standard-version](https://github.com/conventional-changelog/standard-version); there is no pre-wired `bump` script, invoke `pnpm exec standard-version` directly if needed.

## Testing Notes

- Vitest, test files use `.spec.ts`.
- Tests live alongside source in `src/**`.
