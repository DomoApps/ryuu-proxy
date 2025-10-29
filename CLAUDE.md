# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ryuu-proxy is a middleware library for local Domo App development. It intercepts API calls to Domo endpoints (`/data/v{d}`, `/sql/v{d}`, `/dql/v{d}`, `/domo/.../v{d}`, `/api/...`) and proxies authenticated requests to Domo services, allowing developers to work locally while accessing live Domo data.

## Development Commands

**Build**: `pnpm run build` - Compiles TypeScript to `dist/` folder
**Lint**: `pnpm run lint` - Runs tslint on TypeScript files
**Test**: `pnpm test` - Runs mocha tests (note: creates and removes a `test/` directory)
**Test Watch**: `pnpm run tdd` - Runs mocha in watch mode
**Clean**: `pnpm run clean` - Removes node_modules and reinstalls with yarn

## Architecture

### Core Components

**Proxy Class** (`src/index.ts`)

- Main entry point and public API
- Provides `express()` middleware wrapper for Express/Connect
- Provides `stream()` method for other frameworks (Koa, Node http)
- Handles multipart/form-data requests using busboy for file uploads
- Supports HTTP proxy configuration via environment variables (PROXY*HOST, PROXY_PORT, PROXY_USERNAME, PROXY_PASSWORD or REACT_APP*\* prefixed versions)

**Transport Class** (`src/lib/Transport/index.ts`)

- Core proxy logic that handles authentication and request proxying
- Manages Domo client instances via ryuu-client
- Builds axios request configurations with proper headers, cookies, and OAuth tokens
- Request detection via `isDomoRequest()` - matches URL patterns for Domo API endpoints
- Handles cookie merging for OAuth scenarios (combines existing cookies with OAuth tokens `_daatv1` and `_dartv1`)
- Uses configstore to retrieve authentication data from Domo CLI login sessions

**Utils** (`src/lib/utils/index.ts`)

- `getMostRecentLogin()`: Retrieves last Domo CLI login from `~/ryuu/*.json` and associated configstore
- `getOauthTokens()`: Fetches scoped OAuth tokens for apps using oAuth features
- `getProxyId()`: Returns manifest proxyId or generates UUID (required for DQL, writeback, OAuth)

### Authentication Flow

1. Requires prior `domo login` via Domo CLI
2. Proxy reads last login session from `~/ryuu/` directory
3. Retrieves refresh token and dev token from configstore
4. Creates Domo client instance with credentials
5. For OAuth-enabled apps: fetches scoped access/refresh tokens using proxyId
6. Injects authentication via cookies and headers on each proxied request

### Request Processing

1. `isDomoRequest()` checks if URL matches Domo API patterns
2. For multipart requests: uses busboy to stream files to temp directory, then forwards with FormData
3. For standard requests: builds axios config with authentication headers and proxies to Domo
4. `prepareHeaders()` ensures proper referer, host, and cookie headers
5. Response stream is piped directly back to client

### ProxyId Mechanism

Apps using DQL, writeback, or OAuth require a `proxyId` in manifest.json. This ID:

- Ties the local dev environment to a specific published card instance
- Can be extracted from the iframe URL of a published card (`//{proxyId}.domoapps.prodX.domo.com`)
- Is used to retrieve scoped OAuth tokens from configstore
- Defaults to a generated UUID if not specified (sufficient for basic data/SQL queries)

## Dependencies

- **ryuu-client**: Domo API client (peer dependency: ryuu ^4.2.5)
- **axios**: HTTP client for proxy requests
- **busboy**: Multipart form parsing for file uploads
- **configstore**: Storage for Domo CLI authentication data
- **tough-cookie** + **axios-cookiejar-support**: Cookie management

## Error Handling

DomoException errors contain:

- `name`: "DomoException"
- `status` or `statusCode`: HTTP status code
- `statusMessage`: Error description

Handle these explicitly in middleware to expose detailed errors to developers.

## Versioning and Releases

Uses standard-version for conventional commit-based versioning:

- `npm run bump` - Auto-determine version from commits
- `npm run bumpBeta` - Create beta prerelease
- `npm run release` - Build and publish to npm
- `npm run releaseBeta` - Build and publish beta tag

## Testing Notes

- Test files use `.spec.ts` extension
- Tests create a temporary `test/` directory during execution
- Test directory is automatically cleaned up after test run
