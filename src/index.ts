import * as path from 'path';
import * as os from 'os';
import { createWriteStream, existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { Request, Response, NextFunction } from 'express';
import type { IncomingMessage, IncomingHttpHeaders } from 'http';
import { createClient, getHomeDir, type RyuuClient, type Manifest } from 'ryuu-client';
import Configstore from 'configstore';
import busboy from 'busboy';

const CLIENT_ID = 'domo:internal:devstudio';

export interface ProxyConfig {
  client: RyuuClient;
  manifest: Manifest;
  domainUrl: string;
  oauthTokens?: { access: string; refresh: string };
}

export interface LegacyManifest {
  name: string;
  version: string;
  id?: string;
  proxyId?: string;
  scopes?: string[];
  oAuthEnabled?: boolean;
  [key: string]: unknown;
}

export interface LegacyProxyConfig {
  manifest: LegacyManifest;
}

interface LegacyLogin {
  instance: string;
  refreshToken: string;
  devToken?: boolean;
}

const DOMO_PATTERNS = [/^\/domo\/.+\/v\d/, /^\/data\/v\d\/.+/, /^\/sql\/v\d\/.+/, /^\/dql\/v\d\/.+/, /^\/api\/.+/];

function isDomoRequest(url: string | undefined): boolean {
  if (!url) return false;
  return DOMO_PATTERNS.some((p) => p.test(url));
}

function isMultiPart(headers: IncomingHttpHeaders): boolean {
  return Object.entries(headers).some(
    ([key, value]) =>
      key.toLowerCase() === 'content-type' &&
      value !== undefined &&
      value.toString().toLowerCase().includes('multipart')
  );
}

function buildHeaders(
  req: IncomingMessage,
  domainUrl: string,
  oauthTokens?: { access: string; refresh: string }
): Record<string, string | string[] | undefined> {
  const hostname = domainUrl.replace('https://', '');

  // Determine which headers to filter
  const filters: string[] = isMultiPart(req.headers) ? ['content-type', 'content-length', 'cookie'] : ['cookie'];

  const filtered = Object.keys(req.headers).reduce((acc: Record<string, string | string[] | undefined>, key) => {
    if (!filters.includes(key.toLowerCase())) {
      acc[key] = req.headers[key];
    }
    return acc;
  }, {});

  // Fix referer
  const referer = req.headers.referer ?? 'https://0.0.0.0:3000';
  const fixedReferer = referer.includes('?')
    ? referer
    : `${referer}?userId=27&customer=dev&locale=en-US&platform=desktop`;

  // Build cookie header
  let cookie: string | undefined;
  const existing = req.headers.cookie;
  const existingStr = Array.isArray(existing) ? existing.join('; ') : existing;
  const tokenStr = oauthTokens ? `_daatv1=${oauthTokens.access}; _dartv1=${oauthTokens.refresh}` : undefined;

  if (existingStr && tokenStr) {
    cookie = `${existingStr}; ${tokenStr}`;
  } else {
    cookie = existingStr ?? tokenStr;
  }

  return {
    ...filtered,
    referer: fixedReferer,
    host: hostname,
    ...(cookie ? { cookie } : {}),
  };
}

function parseBody(req: IncomingMessage): Promise<string | undefined> {
  const exprReq = req as Request;
  if (typeof exprReq.body !== 'undefined') {
    return Promise.resolve(typeof exprReq.body === 'string' ? exprReq.body : JSON.stringify(exprReq.body));
  }

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      resolve(raw || undefined);
    });
    req.on('error', () => resolve(undefined));
  });
}

function pipeResponse(upstream: globalThis.Response, res: Response): void {
  res.statusCode = upstream.status;

  upstream.headers.forEach((value, key) => {
    if (
      !['transfer-encoding', 'connection', 'keep-alive', 'content-encoding', 'content-length'].includes(
        key.toLowerCase()
      )
    ) {
      res.setHeader(key, value);
    }
  });

  if (upstream.body) {
    Readable.fromWeb(upstream.body as any).pipe(res);
  } else {
    res.end();
  }
}

export type ProxyErrorHandler = (err: any, res: Response) => void;

/**
 * Default error handler. Writes the failure via native `http.ServerResponse`
 * methods (`statusCode` + `end`) rather than Express-only `res.status().send()`
 * so the middleware works under raw connect servers (e.g. Vite) as well as Express.
 */
const defaultOnError: ProxyErrorHandler = (err, res) => {
  res.statusCode = err?.status ?? err?.statusCode ?? 500;
  res.end(err?.message ?? 'Unknown error');
};

/**
 * Augments a ryuu-client error with the legacy axios/`DomoException` fields the
 * v5.0 `Proxy` API surfaced (`statusCode`, `statusMessage`, and
 * `response.data.{statusCode,statusMessage}`), so backwards-compatible
 * `onError` handlers written against the old shape keep reporting the correct
 * status instead of falling back to 500. Applied only in the deprecated facade.
 */
function withLegacyErrorShape(err: any): any {
  if (!err || typeof err !== 'object') return err;
  const statusCode = err.status ?? err.statusCode ?? 500;
  const statusMessage = err.statusMessage ?? err.message ?? 'Unknown error';
  if (err.statusCode === undefined) err.statusCode = statusCode;
  if (err.statusMessage === undefined) err.statusMessage = statusMessage;
  if (err.response?.data === undefined) {
    err.response = { ...(err.response ?? {}), data: { statusCode, statusMessage } };
  }
  return err;
}

export function createProxy(config: ProxyConfig) {
  const { client, domainUrl, oauthTokens } = config;

  async function proxyRequest(req: IncomingMessage, headersOnly?: boolean): Promise<globalThis.Response> {
    const headers = buildHeaders(req, domainUrl, oauthTokens);
    const url = `${domainUrl}${req.url ?? ''}`;
    const body = headersOnly ? undefined : await parseBody(req);

    return client.request<globalThis.Response>(url, {
      method: req.method,
      headers: headers as Record<string, string>,
      body,
      rawResponse: true,
    });
  }

  function express(onError: ProxyErrorHandler = defaultOnError) {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!isDomoRequest(req.url)) return next();

      if (isMultiPart(req.headers)) {
        const bb = busboy({ headers: req.headers });
        let filePath: string;
        let fieldName: string;
        let fileMimeType: string;

        bb.on('file', (fieldname, filestream, fileMetadata) => {
          filePath = path.join(os.tmpdir(), path.basename(fileMetadata.filename));
          fieldName = fieldname;
          fileMimeType = fileMetadata.mimeType;
          filestream.pipe(createWriteStream(filePath));
        });

        bb.on('finish', () => {
          (async () => {
            const headers = buildHeaders(req, domainUrl, oauthTokens);
            const url = `${domainUrl}${req.url ?? ''}`;
            const fileBuffer = await readFile(filePath);
            const filename = path.basename(filePath);
            const form = new FormData();
            form.append(fieldName, new Blob([fileBuffer], { type: fileMimeType }), filename);

            const response = await client.request<globalThis.Response>(url, {
              method: req.method,
              headers: headers as Record<string, string>,
              body: form,
              rawResponse: true,
            });

            pipeResponse(response, res);
          })().catch((err) => onError(err, res));
        });

        return req.pipe(bb);
      }

      proxyRequest(req)
        .then((response) => pipeResponse(response, res))
        .catch((err) => onError(err, res));
    };
  }

  function stream(req: IncomingMessage) {
    if (!isDomoRequest(req.url)) return undefined;
    return proxyRequest(req);
  }

  return { express, stream, isDomoRequest };
}

function getLegacyLogin(): LegacyLogin {
  const loginDir = path.join(getHomeDir(), 'ryuu');
  let loginFiles: string[];

  try {
    loginFiles = readdirSync(loginDir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => path.join(loginDir, file));
  } catch {
    loginFiles = [];
  }

  if (loginFiles.length === 0) {
    throw new Error('Not authenticated. Please login using "domo login"');
  }

  const mostRecent = loginFiles.reduce((previous, next) =>
    statSync(previous).mtime > statSync(next).mtime ? previous : next
  );
  const login = JSON.parse(readFileSync(mostRecent, 'utf8')) as Partial<LegacyLogin>;

  if (!login.instance || !login.refreshToken) {
    throw new Error('Not authenticated. Please login using "domo login"');
  }

  return {
    instance: login.instance,
    refreshToken: login.refreshToken,
    devToken: login.devToken,
  };
}

function getLegacyHttpProxy() {
  const envFile = path.join(process.cwd(), '.env');
  if (existsSync(envFile)) process.loadEnvFile?.(envFile);

  const host = process.env.REACT_APP_PROXY_HOST ?? process.env.PROXY_HOST;
  const port = process.env.REACT_APP_PROXY_PORT ?? process.env.PROXY_PORT;
  const username = process.env.REACT_APP_PROXY_USERNAME ?? process.env.PROXY_USERNAME;
  const password = process.env.REACT_APP_PROXY_PASSWORD ?? process.env.PROXY_PASSWORD;

  if (!host || !port) return undefined;

  return {
    host,
    port,
    ...(username && password ? { username, password } : {}),
  };
}

async function createLegacyProxy(manifest: LegacyManifest) {
  const login = getLegacyLogin();
  const client = createClient({
    instance: login.instance,
    refreshToken: login.refreshToken,
    clientId: CLIENT_ID,
    devToken: login.devToken,
    proxy: getLegacyHttpProxy(),
  });
  const typedManifest = manifest as unknown as Manifest;
  const appData = await client.apps.getEnvironment(typedManifest, manifest.proxyId);
  const oauthEnabled = manifest.oAuthEnabled === true;
  const oauthTokens =
    oauthEnabled && manifest.proxyId ? getOauthTokens(client.instance, manifest.proxyId, manifest.scopes) : undefined;

  return createProxy({
    client,
    manifest: typedManifest,
    domainUrl: appData.url,
    oauthTokens,
  });
}

/**
 * Backwards-compatible facade for the v5.0 public API.
 *
 * @deprecated Prefer createProxy() with an explicit RyuuClient and domainUrl.
 */
export class Proxy {
  private readonly proxyPromise: Promise<ReturnType<typeof createProxy>>;

  /**
   * Error handler invoked when a proxied request (or proxy initialization)
   * fails. Overridable for backwards compatibility with the v5.0 API; the
   * default writes via native response methods so it works under connect
   * servers (e.g. Vite) as well as Express.
   */
  onError: ProxyErrorHandler = defaultOnError;

  constructor({ manifest }: LegacyProxyConfig) {
    this.proxyPromise = createLegacyProxy(manifest);
    this.proxyPromise.catch(() => {
      // Initialization errors are surfaced when express() or stream() is used.
    });
  }

  express =
    () =>
    (req: Request, res: Response, next: NextFunction): void => {
      if (!isDomoRequest(req.url)) {
        next();
        return;
      }

      void this.proxyPromise
        .then((proxy) => proxy.express((err, r) => this.onError(withLegacyErrorShape(err), r))(req, res, next))
        .catch((err) => this.onError(withLegacyErrorShape(err), res));
    };

  stream = (req: IncomingMessage): Promise<globalThis.Response> | undefined => {
    if (!isDomoRequest(req.url)) return undefined;

    return this.proxyPromise.then(async (proxy) => {
      const response = proxy.stream(req);
      if (!response) throw new Error('Unable to proxy request');
      return response;
    });
  };
}

// Helper: resolve OAuth tokens from configstore for a given proxyId
export function getOauthTokens(
  instance: string,
  proxyId: string,
  scopes?: string[]
): { access: string; refresh: string } | undefined {
  const configPath = path.join(getHomeDir(), 'ryuu', `${instance}.json`);
  const configstore = new Configstore(`/ryuu/${instance}`, undefined, {
    configPath,
  });
  const allScopes = scopes ? ['domoapps', ...scopes] : ['domoapps'];
  const key = `${proxyId}-${allScopes.join('-')}`;
  const access = configstore.get(`${key}-accessToken`) as string;
  const refresh = configstore.get(`${key}-refreshToken`) as string;
  if (access && refresh) return { access, refresh };
  return undefined;
}

// Re-export types
export type { Manifest, RyuuClient } from 'ryuu-client';
