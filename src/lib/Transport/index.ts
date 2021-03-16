import * as Promise from 'core-js/features/promise';
import Domo = require('ryuu-client');
import * as axios from 'axios';
import { Request } from 'express';
import { IncomingMessage, IncomingHttpHeaders } from 'http';
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
const tough = require('tough-cookie');

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
    this.appContextId = (manifest['proxyId']) ? manifest.proxyId : Domo.createUUID();
    this.clientPromise = this.getLastLogin();
    this.domainPromise = this.clientPromise.then((client) => { return client.getDomoappsData(this.manifest); });
    this.oauthTokenPromise = this.getScopedOauthTokens();
  }

  request = (options: axios.AxiosRequestConfig) => this.clientPromise
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
    const self = this;

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
          const env = self.getEnv(domoClient.instance);

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
          data: { designId: this.manifest.id, mapping: this.manifest.mapping },
          headers: {
            'content-type': 'application/json',
          },
        };

        return client.processRequest(options);
      })
      .then(res => res[0]);
  }

  build(req: IncomingMessage): Promise<axios.AxiosRequestConfig> {
    let options;
    return this.buildBasic(req)
      .then((basicOptions) => {
        options = basicOptions;
        options.transformResponse = [];
        options.responseType = 'stream';
        return this.parseBody(req);
      })
      .then((data) => {
        return {
          ...options,
          data,
        };
      });
  }

  buildBasic(req: IncomingMessage): Promise<axios.AxiosRequestConfig> {
    let api: string;
    let hostname: string;
    return this.domainPromise
      .then((domain) => {
        api = `${domain.url}${req.url}`;
        hostname = domain.url;

        return this.createContext();
      })
      .then(context => (this.prepareHeaders(req.headers, context.id, hostname)))
      .then((headers) => {
        axiosCookieJarSupport(axios);
        const cookieJar = new tough.CookieJar();
        const jar = cookieJar;

        return {
          jar,
          headers,
          url: api,
          responseType: 'stream',
          method: req.method,
        };
      });
  }

  private prepareHeaders(headers: IncomingHttpHeaders, context: string, host: string): Promise<IncomingHttpHeaders> {
    const hostname = host.replace('https://', '');
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
        host: hostname,
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
