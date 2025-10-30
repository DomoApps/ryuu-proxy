import Domo = require('ryuu-client');
import axios, { AxiosRequestConfig } from 'axios';
import { Request } from 'express';
import { IncomingMessage, IncomingHttpHeaders } from 'http';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

import * as dotenv from 'dotenv';
import { Manifest } from 'ryuu-client/lib/models';
import { getMostRecentLogin, getProxyId, isOauthEnabled, getOauthTokens } from '../utils';
import { ProxyOptions, OauthToken } from '../models';
import { CLIENT_ID } from '../constants';

export default class Transport {
  private manifest: Manifest;

  private clientPromise: Promise<Domo>;

  private domainPromise: Promise<{ url: string }>;

  private proxyId: string;

  private oauthTokenPromise: Promise<OauthToken | undefined>;

  private cookieJar: CookieJar;

  constructor({ manifest }: ProxyOptions) {
    this.manifest = manifest;
    this.clientPromise = this.getLastLogin();
    this.proxyId = getProxyId(manifest);
    this.domainPromise = this.clientPromise.then(async (client) =>
      client.getDomoappsData({ ...this.manifest }, this.proxyId)
    );
    this.oauthTokenPromise = this.getScopedOauthTokens();

    // Add error handlers to prevent unhandled promise rejections
    // These will be caught by the actual consumers when they use the promises
    this.clientPromise.catch(() => {
      // Silently catch - error will be handled when promise is actually used
    });
    this.domainPromise.catch(() => {
      // Silently catch - error will be handled when promise is actually used
    });
    this.oauthTokenPromise.catch(() => {
      // Silently catch - error will be handled when promise is actually used
    });

    // Initialize cookie jar once and reuse it for all requests to persist auth cookies
    wrapper(axios);
    this.cookieJar = new CookieJar();
  }

  request = (options: AxiosRequestConfig): Promise<any> =>
    this.clientPromise.then((client) => client.processRequestRaw(options as any));

  getEnv(instance: string): string {
    const regexp = /([-_\w]+)\.(.*)/;
    const int = 2;
    const match = instance.match(regexp);
    if (!match) {
      throw new Error(`Invalid instance format: ${instance}`);
    }
    return match[int];
  }

  isDomoRequest(url: string | undefined): boolean {
    if (!url) {
      return false;
    }
    const domoPattern = /^\/domo\/.+\/v\d/;
    const dataPattern = /^\/data\/v\d\/.+/;
    const sqlQueryPattern = /^\/sql\/v\d\/.+/;
    const dqlPattern = /^\/dql\/v\d\/.+/;
    const apiPattern = /^\/api\/.+/;

    return (
      domoPattern.test(url) ||
      dataPattern.test(url) ||
      sqlQueryPattern.test(url) ||
      dqlPattern.test(url) ||
      apiPattern.test(url)
    );
  }

  isMultiPartRequest(headers: IncomingHttpHeaders): boolean {
    return Object.entries(headers).some(
      ([header, value]) =>
        header.toLowerCase() === 'content-type' &&
        value !== undefined &&
        value.toString().toLowerCase().includes('multipart')
    );
  }

  getManifest(): Manifest {
    return this.manifest;
  }

  getDomainPromise(): Promise<{ url: string }> {
    return this.domainPromise;
  }

  getLastLogin(): Promise<Domo> {
    return getMostRecentLogin()
      .then(this.verifyLogin)
      .then((recentLogin) => {
        dotenv.config({ path: `${process.cwd()}/.env` });
        const proxyHost = process.env.REACT_APP_PROXY_HOST ?? process.env.PROXY_HOST;
        const proxyPort = process.env.REACT_APP_PROXY_PORT ?? process.env.PROXY_PORT;
        const proxyUsername = process.env.REACT_APP_PROXY_USERNAME ?? process.env.PROXY_USERNAME;
        const proxyPassword = process.env.REACT_APP_PROXY_PASSWORD ?? process.env.PROXY_PASSWORD;

        if (proxyHost !== undefined && proxyPort !== undefined) {
          if (proxyUsername !== undefined && proxyPassword !== undefined) {
            return new Domo(
              recentLogin.instance!,
              recentLogin.refreshToken!,
              CLIENT_ID,
              {
                host: proxyHost,
                port: proxyPort,
                auth: `${proxyUsername}:${proxyPassword}`,
              },
              recentLogin.devToken as boolean
            );
          }
          return new Domo(
            recentLogin.instance!,
            recentLogin.refreshToken!,
            CLIENT_ID,
            {
              host: proxyHost,
              port: proxyPort,
            },
            recentLogin.devToken as boolean
          );
        }
        return new Domo(
          recentLogin.instance!,
          recentLogin.refreshToken!,
          CLIENT_ID,
          {},
          recentLogin.devToken as boolean
        );
      });
  }

  getScopedOauthTokens(): Promise<OauthToken | undefined> {
    if (isOauthEnabled(this.manifest)) {
      return getOauthTokens(this.proxyId, this.manifest.scopes);
    }

    return Promise.resolve(undefined);
  }

  build(req: IncomingMessage): Promise<AxiosRequestConfig> {
    let options: AxiosRequestConfig;
    return this.buildBasic(req)
      .then((basicOptions) => {
        options = basicOptions;
        options.transformResponse = [];
        options.responseType = 'stream';
        return this.parseBody(req);
      })
      .then((data) => ({
        ...options,
        data,
      }));
  }

  buildBasic(req: IncomingMessage): Promise<AxiosRequestConfig> {
    let api: string;
    let hostname: string;
    return this.domainPromise
      .then((domain) => {
        api = `${domain.url}${req.url ?? ''}`;
        hostname = domain.url;
        return this.prepareHeaders(req.headers, this.proxyId, hostname);
      })
      .then((headers) => ({
        jar: this.cookieJar,
        headers,
        url: api,
        responseType: 'stream' as const,
        method: req.method,
      }));
  }

  private prepareHeaders(headers: IncomingHttpHeaders, _context: string, host: string): Promise<IncomingHttpHeaders> {
    const hostname = host.replace('https://', '');
    return this.oauthTokenPromise.then((tokens: OauthToken | undefined) => {
      const refererValue = headers.referer ?? 'https://0.0.0.0:3000';
      const referer =
        refererValue.indexOf('?') >= 0
          ? `${refererValue}`
          : `${refererValue}?userId=27&customer=dev&locale=en-US&platform=desktop`;

      const cookieHeader = this.prepareCookies(headers, tokens);

      const filters: string[] = this.isMultiPartRequest(headers)
        ? ['content-type', 'content-length', 'cookie']
        : ['cookie'];

      const filteredHeaders = Object.keys(headers).reduce(
        (newHeaders: Record<string, string | string[] | undefined>, key) => {
          if (!filters.includes(key.toLowerCase())) {
            return { ...newHeaders, [key]: headers[key] };
          }
          return newHeaders;
        },
        {}
      );

      return {
        ...filteredHeaders,
        ...cookieHeader,
        referer,
        host: hostname,
      };
    });
  }

  private prepareCookies(headers: IncomingHttpHeaders, tokens: OauthToken | undefined): { cookie?: string } {
    const existingCookie = Object.keys(headers).reduce(
      (newHeaders: Record<string, string>, key) => {
        if (key.toLowerCase() === 'cookie') {
          const cookieValue = headers[key];
          // handle if cookie is an array
          if (Array.isArray(cookieValue)) {
            return { ...newHeaders, cookie: cookieValue.join('; ') };
          }
          if (cookieValue !== undefined) {
            return { ...newHeaders, cookie: cookieValue as string };
          }
        }
        return newHeaders;
      },
      {} as Record<string, string>
    );

    const tokenCookie = tokens !== undefined ? { cookie: `_daatv1=${tokens.access}; _dartv1=${tokens.refresh}` } : {};

    if (existingCookie.cookie !== undefined && tokenCookie.cookie !== undefined) {
      return {
        cookie: `${existingCookie.cookie}; ${tokenCookie.cookie}`,
      };
    }

    if (existingCookie.cookie === undefined) {
      return tokenCookie;
    }

    return existingCookie;
  }

  private parseBody(req: IncomingMessage): Promise<string | undefined> {
    // if body-parser was used before this middleware the "body" attribute will be set
    const exprReq = req as Request;
    if (typeof exprReq.body !== 'undefined') {
      if (typeof exprReq.body === 'string') {
        return Promise.resolve(exprReq.body);
      }
      return Promise.resolve(JSON.stringify(exprReq.body));
    }

    return new Promise((resolve) => {
      const body: Buffer[] = [];

      try {
        req.on('data', (chunk: Buffer) => body.push(chunk));

        req.on('end', () => {
          const raw = Buffer.concat(body).toString();
          resolve(raw);
        });

        req.on('error', () => {
          resolve(undefined);
        });
      } catch (e) {
        resolve(undefined);
      }
    });
  }

  private verifyLogin(login: { refreshToken?: string; instance?: string; devToken?: string | boolean }) {
    if (!login.refreshToken) {
      throw new Error('Not authenticated. Please login using "domo login"');
    }

    return login;
  }
}
