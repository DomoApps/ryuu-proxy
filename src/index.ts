import * as path from 'path';
import * as os from 'os';
import { createWriteStream } from 'fs';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { Request, Response, NextFunction } from 'express';
import type { IncomingMessage, IncomingHttpHeaders } from 'http';
import type { RyuuClient, Manifest } from 'ryuu-client';
import Configstore from 'configstore';
import busboy from 'busboy';

export interface ProxyConfig {
  client: RyuuClient;
  manifest: Manifest;
  domainUrl: string;
  oauthTokens?: { access: string; refresh: string };
}

const DOMO_PATTERNS = [
  /^\/domo\/.+\/v\d/,
  /^\/data\/v\d\/.+/,
  /^\/sql\/v\d\/.+/,
  /^\/dql\/v\d\/.+/,
  /^\/api\/.+/,
];

function isDomoRequest(url: string | undefined): boolean {
  if (!url) return false;
  return DOMO_PATTERNS.some((p) => p.test(url));
}

function isMultiPart(headers: IncomingHttpHeaders): boolean {
  return Object.entries(headers).some(
    ([key, value]) =>
      key.toLowerCase() === 'content-type' &&
      value !== undefined &&
      value.toString().toLowerCase().includes('multipart'),
  );
}

function buildHeaders(
  req: IncomingMessage,
  domainUrl: string,
  oauthTokens?: { access: string; refresh: string },
): Record<string, string | string[] | undefined> {
  const hostname = domainUrl.replace('https://', '');

  // Determine which headers to filter
  const filters: string[] = isMultiPart(req.headers)
    ? ['content-type', 'content-length', 'cookie']
    : ['cookie'];

  const filtered = Object.keys(req.headers).reduce(
    (acc: Record<string, string | string[] | undefined>, key) => {
      if (!filters.includes(key.toLowerCase())) {
        acc[key] = req.headers[key];
      }
      return acc;
    },
    {},
  );

  // Fix referer
  const referer = req.headers.referer ?? 'https://0.0.0.0:3000';
  const fixedReferer = referer.includes('?')
    ? referer
    : `${referer}?userId=27&customer=dev&locale=en-US&platform=desktop`;

  // Build cookie header
  let cookie: string | undefined;
  const existing = req.headers.cookie;
  const existingStr = Array.isArray(existing)
    ? existing.join('; ')
    : existing;
  const tokenStr = oauthTokens
    ? `_daatv1=${oauthTokens.access}; _dartv1=${oauthTokens.refresh}`
    : undefined;

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
    return Promise.resolve(
      typeof exprReq.body === 'string'
        ? exprReq.body
        : JSON.stringify(exprReq.body),
    );
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
  res.status(upstream.status);

  upstream.headers.forEach((value, key) => {
    if (
      !['transfer-encoding', 'connection', 'keep-alive', 'content-encoding', 'content-length'].includes(
        key.toLowerCase(),
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

export function createProxy(config: ProxyConfig) {
  const { client, domainUrl, oauthTokens } = config;

  async function proxyRequest(
    req: IncomingMessage,
    headersOnly?: boolean,
  ): Promise<globalThis.Response> {
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

  function express() {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!isDomoRequest(req.url)) return next();

      if (isMultiPart(req.headers)) {
        const bb = busboy({ headers: req.headers });
        let filePath: string;
        let fieldName: string;
        let fileMimeType: string;

        bb.on('file', (fieldname, filestream, fileMetadata) => {
          filePath = path.join(
            os.tmpdir(),
            path.basename(fileMetadata.filename),
          );
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
            form.append(
              fieldName,
              new Blob([fileBuffer], { type: fileMimeType }),
              filename,
            );

            const response = await client.request<globalThis.Response>(url, {
              method: req.method,
              headers: headers as Record<string, string>,
              body: form,
              rawResponse: true,
            });

            pipeResponse(response, res);
          })().catch((err) => {
            const status = err.status ?? err.statusCode ?? 500;
            res.status(status).send(err.message ?? 'Unknown error');
          });
        });

        return req.pipe(bb);
      }

      proxyRequest(req)
        .then((response) => pipeResponse(response, res))
        .catch((err) => {
          const status = err.status ?? err.statusCode ?? 500;
          res.status(status).send(err.message ?? 'Unknown error');
        });
    };
  }

  function stream(req: IncomingMessage) {
    if (!isDomoRequest(req.url)) return undefined;
    return proxyRequest(req);
  }

  return { express, stream, isDomoRequest };
}

// Helper: resolve OAuth tokens from configstore for a given proxyId
export function getOauthTokens(
  instance: string,
  proxyId: string,
  scopes?: string[],
): { access: string; refresh: string } | undefined {
  const configstore = new Configstore(`/ryuu/${instance}`);
  const allScopes = scopes ? ['domoapps', ...scopes] : ['domoapps'];
  const key = `${proxyId}-${allScopes.join('-')}`;
  const access = configstore.get(`${key}-accessToken`) as string;
  const refresh = configstore.get(`${key}-refreshToken`) as string;
  if (access && refresh) return { access, refresh };
  return undefined;
}

// Re-export types
export type { Manifest, RyuuClient } from 'ryuu-client';
