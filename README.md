# @domoinc/ryuu-proxy

[![npm version](https://img.shields.io/npm/v/@domoinc/ryuu-proxy.svg?style=flat-square)](https://www.npmjs.org/package/@domoinc/ryuu-proxy)
[![install size](https://img.shields.io/badge/dynamic/json?url=https://packagephobia.com/v2/api.json?p=@domoinc/ryuu-proxy&query=$.install.pretty&label=install%20size&style=flat-square)](https://packagephobia.com/result?p=@domoinc/ryuu-proxy)
[![npm downloads](https://img.shields.io/npm/dm/@domoinc/ryuu-proxy.svg?style=flat-square)](https://npm-stat.com/charts.html?package=@domoinc/ryuu-proxy)
[![types](https://img.shields.io/npm/types/@domoinc/ryuu-proxy.svg?style=flat-square)](https://www.npmjs.org/package/@domoinc/ryuu-proxy)
[![license](https://img.shields.io/npm/l/@domoinc/ryuu-proxy.svg?style=flat-square)](https://github.com/DomoApps/ryuu-proxy/blob/master/LICENSE)
[![Known Vulnerabilities](https://snyk.io/advisor/npm-package/@domoinc/ryuu-proxy/badge.svg)](https://snyk.io/advisor/npm-package/@domoinc/ryuu-proxy)

Middleware for local [Domo App](https://developer.domo.com/docs/dev-studio-guides/overview) development. It intercepts calls to Domo data/API endpoints and proxies authenticated requests to your Domo instance, so you can develop against real data from your local dev server.

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
  - [Configuration](#configuration)
  - [Express / Connect](#with-express--connect)
  - [Other Frameworks](#with-other-frameworks)
  - [Error Handling](#error-handling)
- [HTTP Proxy Support](#http-proxy-support)
- [Getting a proxyId](#getting-a-proxyid-advanced)
- [Contributing](#contributing)
- [License](#license)

## Features

- Intercepts and proxies Domo API traffic: `/data/v{d}`, `/sql/v{d}`, `/dql/v{d}`, `/domo/.../v{d}`, `/api/...`
- Drop-in Express / Connect middleware via `proxy.express()`
- Framework-agnostic `proxy.stream(req)` for Koa, Node `http`, Fastify, etc.
- Handles multipart/form-data uploads (file streams via [`busboy`](https://github.com/mscdex/busboy))
- Injects OAuth access/refresh tokens for apps using DQL, writeback, or OAuth features
- Reads auth from your existing Domo CLI login session — no extra config
- Ships with TypeScript types
- ESM package

## Requirements

- Node.js **18+**
- An active Domo CLI session (`domo login`) — see [`@domoinc/ryuu`](https://www.npmjs.com/package/@domoinc/ryuu)
- A project `manifest.json` that has been published at least once (`domo publish`)
- Peer: `express ^4.17.0 || ^5.0.0` (only required if you use `proxy.express()`)

## Installation

```bash
pnpm add -D @domoinc/ryuu-proxy
# or
npm install --save-dev @domoinc/ryuu-proxy
# or
yarn add -D @domoinc/ryuu-proxy
```

## Usage

This library leverages the last login session from your Domo CLI. If that session is no longer active or doesn't exist, the proxy won't work. Log in before starting your dev server:

```bash
domo login
```

### Configuration

```js
import { Proxy } from "@domoinc/ryuu-proxy";
import manifest from "./path/to/app/manifest.json" with { type: "json" };

const proxy = new Proxy({ manifest });
```

The `Proxy` constructor accepts a config object.

#### Required

- `manifest` — parsed contents of your project's `manifest.json`. `domo publish` must have been run at least once so the manifest has an `id`.

#### Optional

- `manifest.proxyId` — required for apps using DQL, writebacks, or OAuth. If you're unsure, you probably don't need it. See [Getting a proxyId](#getting-a-proxyid-advanced).

### With [Express](https://expressjs.com/) / [Connect](https://github.com/senchalabs/connect)

```js
import express from "express";

const app = express();
app.use(proxy.express());
```

### With Other Frameworks

For other frameworks, `stream()` returns a readable stream you can pipe back to your response. It accepts a standard Node [IncomingMessage](https://nodejs.org/api/http.html#http_class_http_incomingmessage), which most frameworks extend.

```js
// koa
app.use(async (ctx, next) => {
  await proxy
    .stream(ctx.req)
    .then((data) => (ctx.body = ctx.req.pipe(data)))
    .catch(next);
});
```

```js
// express
app.use((req, res, next) => {
  proxy
    .stream(req)
    .then((stream) => stream.pipe(res))
    .catch(() => next());
});
```

```js
// node http
import http from "node:http";

const server = http.createServer((req, res) => {
  if (req.url === "/") {
    loadHomePage(res);
  } else {
    proxy.stream(req).then((stream) => stream.pipe(res));
  }
});
```

### Error Handling

Ignoring errors causes the proxy to fail silently and the request returns `404`. To expose errors, catch `DomoException` and forward the status:

```js
// koa
app.use(async (ctx, next) => {
  await proxy
    .stream(ctx.req)
    .then((data) => (ctx.body = ctx.req.pipe(data)))
    .catch((err) => {
      if (err.name === "DomoException") {
        ctx.status = err.status || err.statusCode || 500;
        ctx.body = err;
      } else {
        next();
      }
    });
});
```

```js
// express / connect
app.use((req, res, next) => {
  proxy
    .stream(req)
    .then((stream) => stream.pipe(res))
    .catch((err) => {
      if (err.name === "DomoException") {
        res.status(err.status || err.statusCode || 500).json(err);
      } else {
        next();
      }
    });
});
```

```js
// node http
const server = http.createServer((req, res) => {
  if (req.url === "/") {
    loadHomePage();
  } else {
    proxy
      .stream(req)
      .then((stream) => stream.pipe(res))
      .catch((err) => {
        if (err.name === "DomoException") {
          res.writeHead(err.status || err.statusCode || 500);
          res.end(JSON.stringify(err));
        }
      });
  }
});
```

`DomoException` shape:

| Field | Description |
| --- | --- |
| `name` | Always `"DomoException"` |
| `status` / `statusCode` | HTTP status code |
| `statusMessage` | Error description |

## HTTP Proxy Support

If you sit behind a corporate HTTP proxy, set any of the following environment variables. `REACT_APP_`-prefixed variants are also honored for Create React App projects.

| Variable | Purpose |
| --- | --- |
| `PROXY_HOST` / `REACT_APP_PROXY_HOST` | Proxy hostname |
| `PROXY_PORT` / `REACT_APP_PROXY_PORT` | Proxy port |
| `PROXY_USERNAME` / `REACT_APP_PROXY_USERNAME` | Basic auth username (optional) |
| `PROXY_PASSWORD` / `REACT_APP_PROXY_PASSWORD` | Basic auth password (optional) |

## Getting a proxyId (Advanced)

Apps using DQL, writeback, or OAuth features must supply a `proxyId` in the proxy configuration so the proxy can route requests correctly. A `proxyId` is of the form `XXXXXXXX-XXXX-4XXX-XXXX-XXXXXXXXXXXX`. To find it:

1. Ensure the app has been published at least once with `domo publish`.
2. Publish a new card from your app design, or open an existing card built from it.
3. Right-click the card and choose **Inspect element**.
4. Find the `<iframe>` containing your app. Its URL looks like `//{HASH}.domoapps.prodX.domo.com?userId=...`.
5. Copy the hash between `//` and `.domoapps` — that is your `proxyId`.

`proxyId`s tie apps to cards. If you delete the card you pulled the ID from, you'll need a new one from another card created from the same app design.

## Related Packages

- [`@domoinc/ryuu`](https://www.npmjs.com/package/@domoinc/ryuu) — the Domo CLI (`domo login`, `domo publish`, etc.)
- [`@domoinc/ryuu-client`](https://www.npmjs.com/package/@domoinc/ryuu-client) — underlying Domo API client

## Contributing

### Workflow

1. Create a branch (e.g. `DOMO-XXXXXX`)
2. Make and commit changes
3. Test — optionally publish an alpha/beta for integration testing
4. Open a pull request
5. After merge to `master`, bump the version and release to npm

### Scripts

| Script | Description |
| --- | --- |
| `pnpm run build` | Compile TypeScript to `dist/` |
| `pnpm test` | Run the test suite (vitest) |
| `pnpm run test:watch` | Run vitest in watch mode |
| `pnpm run test:coverage` | Run tests with coverage |
| `pnpm run format` | Format source with Prettier |
| `pnpm run release:production` | Build and publish to npm |
| `pnpm run release:beta` | Build and publish under the `beta` tag |
| `pnpm run release:alpha` | Build and publish under the `alpha` tag |

### Versioning

This project uses [standard-version](https://github.com/conventional-changelog/standard-version) with conventional commits to determine version bumps.

## License

[MIT](./LICENSE)
