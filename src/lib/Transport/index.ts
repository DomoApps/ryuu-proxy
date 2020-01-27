import * as Promise from 'core-js/es6/promise';
import * as Domo from 'ryuu-client';
import * as request from 'request';
import { Request } from 'express';
import { IncomingMessage, IncomingHttpHeaders } from 'http';

import { getMostRecentLogin, getProxyId, isOauthEnabled, getOauthTokens } from '../utils';
import { Manifest, DomoClient, ProxyOptions, OauthToken } from '../models';
import { CLIENT_ID } from '../constants';

export default class Transport {
  private manifest: Manifest;
  private clientPromise: Promise<DomoClient>;
  private domainPromise: Promise;
  private appContextId: string;
  private oauthTokenPromise: Promise<OauthToken | undefined>;

  constructor({ manifest }: ProxyOptions) {
    this.manifest = manifest;
    this.appContextId = getProxyId(manifest);
    this.clientPromise = this.getLastLogin();
    this.domainPromise = this.getDomoDomain();
    this.oauthTokenPromise = this.getScopedOauthTokens();
  }

  request = (options: request.Options) => this.clientPromise
    .then(client => client.processRequestRaw(options))

  getEnv(instance: string): string {
    const regexp = /([-_\w]+)\.(.*)/;
    const int = 2;

    return instance.match(regexp)[int];
  }

  isDomoRequest(url: string): boolean {
    const domoPattern = /^\/domo\/.+\/v\d/;
    const dataPattern = /^\/data\/v\d\/.+/;
    const sqlQueryPattern = /^\/sql\/v\d\/.+/;
    const dqlPattern = /^\/dql\/v\d\/.+/;
    const apiPattern = /^\/api\/.+/;

    return (
      domoPattern.test(url)
      || dataPattern.test(url)
      || sqlQueryPattern.test(url)
      || dqlPattern.test(url)
      || apiPattern.test(url)
    );
  }

  isMultiPartRequest(headers: IncomingHttpHeaders): boolean {
    return Object
      .entries(headers)
      .some(
        ([header, value]) => header.toLowerCase() === 'content-type'
        && value.toString().toLowerCase().includes('multipart'),
      );
  }

  getManifest(): Manifest {
    return this.manifest;
  }

  getDomainPromise(): Promise {
    return this.domainPromise;
  }

  getLastLogin(): Promise<DomoClient> {
    return getMostRecentLogin()
      .then(this.verifyLogin)
      .then(recentLogin => new Domo(recentLogin.instance, recentLogin.refreshToken, CLIENT_ID));
  }

  getScopedOauthTokens(): Promise<OauthToken | undefined> {
    if (isOauthEnabled(this.manifest)) {
      return getOauthTokens(this.appContextId, this.manifest.scopes);
    }

    return new Promise(resolve => resolve(undefined));
  }

  getDomoDomain(): Promise<string> {
    const uuid = this.appContextId;
    let domoClient;

    return this.clientPromise
      .then((client) => {
        domoClient = client;
        const options = {
          url: `${client.server}/api/content/v1/mobile/environment`,
        };

        return client.processRequest(options);
      })
      .then(
        res => `https://${uuid}.${JSON.parse(res).domoappsDomain}`,
        () => {
          const env = this.getEnv(domoClient.instance);

          return `https://${uuid}.domoapps.${env}`;
        },
      );
  }

  createContext(): Promise {
    return this.clientPromise
      .then((client) => {
        const options = {
          method: 'POST',
          url: `${client.server}/domoapps/apps/v2/contexts`,
          json: { designId: this.manifest.id, mapping: this.manifest.mapping },
        };

        return client.processRequest(options);
      })
      .then(res => res[0]);
  }

  build(req: IncomingMessage): Promise<request.Options> {
    let options;
    return this.buildBasic(req)
      .then((basicOptions) => {
        options = basicOptions;
        return this.parseBody(req);
      })
      .then((body) => {
        return {
          ...options,
          body,
        };
      });
  }

  buildBasic(req: IncomingMessage): Promise<request.Options> {
    let api: string;

    return this.domainPromise
      .then((domain) => {
        api = `${domain}${req.url}`;

        return this.createContext();
      })
      .then(context => (this.prepareHeaders(req.headers, context.id)))
      .then((headers) => {
        const jar = request.jar();

        return {
          jar,
          headers,
          url: api,
          method: req.method,
        };
      });
  }

  private prepareHeaders(headers: IncomingHttpHeaders, context: string): Promise<IncomingHttpHeaders> {
    return this.oauthTokenPromise.then((tokens: OauthToken | undefined) => {
      if (!headers.hasOwnProperty('referer')) headers.referer = 'https://0.0.0.0:3000';
      const referer = (headers.referer.indexOf('?') >= 0)
        ? (`${headers.referer}&context=${context}`)
        : (`${headers.referer}?userId=27&customer=dev&locale=en-US&platform=desktop&context=${context}`);

      const cookieHeader = this.prepareCookies(headers, tokens);

      const filters: string[] = (this.isMultiPartRequest(headers))
        ? ([
          'content-type',
          'content-length',
          'cookie',
        ])
        : ([
          'cookie',
        ]);

      return {
        ...Object.keys(headers).reduce(
          (newHeaders, key) => {
            if (!filters.includes(key.toLowerCase())) {
              newHeaders[key] = headers[key];
            }
            return newHeaders;
          },
          {}),
        ...cookieHeader,
        referer,
        host: undefined,
      };
    });
  }

  private prepareCookies(headers: IncomingHttpHeaders, tokens: OauthToken | undefined): { cookie: string } | {} {
    const existingCookie = Object.keys(headers).reduce(
      (newHeaders, key) => {
        if (key.toLowerCase() === 'cookie') {
          // handle if cookie is an array
          if (Array.isArray(headers[key])) {
            newHeaders['cookie'] = (headers[key] as string[]).join('; ');
          } else {
            newHeaders['cookie'] = headers[key] as string;
          }
        }
        return newHeaders;
      },
      {});

    const tokenCookie = (tokens !== undefined)
      ? ({ cookie: `_daatv1=${ tokens.access }; _dartv1=${ tokens.refresh }` })
      : ({});

    if (existingCookie['cookie'] !== undefined && tokenCookie['cookie'] !== undefined) {
      return ({ cookie: `${existingCookie['cookie']}; ${tokenCookie['cookie']}` });
    }

    if (existingCookie['cookie'] === undefined) {
      return tokenCookie;
    }

    return existingCookie;
  }

  private parseBody(req: IncomingMessage): Promise<string|void> {
    // if body-parser was used before this middleware the "body" attribute will be set
    const exprReq = req as Request;
    if (typeof exprReq.body !== 'undefined') {
      if (typeof exprReq.body === 'string') return Promise.resolve(exprReq.body);
      return Promise.resolve(JSON.stringify(exprReq.body));
    }

    return new Promise((resolve) => {
      const body = [];

      try {
        req.on('data', chunk => body.push(chunk));

        req.on('end', () => {
          const raw = Buffer.concat(body).toString();
          resolve(raw);
        });

        req.on('error', () => resolve(null));
      } catch (e) {
        resolve();
      }
    });
  }

  private verifyLogin(login) {
    if (!login.refreshToken) {
      throw new Error('Not authenticated. Please login using "domo login"');
    }

    return login;
  }
}
