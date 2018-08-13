import * as Promise from 'core-js/es6/promise';
import * as Domo from 'ryuu-client';
import * as request from 'request';
import { Request } from 'express';
import { IncomingMessage, IncomingHttpHeaders, ClientResponse } from 'http';

import { DomoException } from '../errors';
import { Manifest, DomoClient, ProxyOptions } from '../models';
import { CLIENT_ID } from '../constants';

export default class Transport {
  private manifest: Manifest;
  private client: DomoClient;
  private domainPromise: Promise;
  private appContextId: string;

  constructor({
    manifest,
    appContextId,
  }: ProxyOptions) {
    this.manifest = manifest;
    this.appContextId = (typeof appContextId === 'string') ? appContextId : Domo.createUUID();
    this.client = this.getLastLogin();
    this.domainPromise = this.getDomoDomain();
  }

  request = options => this.client.processRawRequest(options);

  getEnv(instance: string): string {
    const regexp = /([-_\w]+)\.(.*)/;
    const int = 2;

    return instance.match(regexp)[int];
  }

  isDomoRequest(url: string): boolean {
    const domoPattern = /^\/domo\/.+\/v\d/;
    const dataPattern = /^\/data\/v\d\/.+/;
    const dqlPattern = /^\/dql\/v\d\/.+/;

    return (
      domoPattern.test(url)
      || dataPattern.test(url)
      || dqlPattern.test(url)
    );
  }

  getManifest(): Manifest {
    return this.manifest;
  }

  getDomoClient(): DomoClient {
    return this.client;
  }

  getDomainPromise(): Promise {
    return this.domainPromise;
  }

  getLastLogin(): DomoClient {
    const recentLogin = Domo.getMostRecentLogin();

    this.verifyLogin(recentLogin);

    return new Domo(recentLogin.instance, recentLogin.refreshToken, CLIENT_ID);
  }

  getDomoDomain(): Promise<string> {
    const uuid = this.appContextId;
    const options = {
      url: `${this.client.server}/api/content/v1/mobile/environment`,
    };

    return this.client.processRequest(options)
      .then(
        res => `https://${uuid}.${res.domoappsDomain}`,
        () => {
          const env = this.getEnv(this.client.instance);

          return `https://${uuid}.domoapps.${env}`;
        },
      );
  }

  createContext(): Promise {
    const options = {
      method: 'POST',
      url: `${this.client.server}/domoapps/apps/v2/contexts`,
      json: { designId: this.manifest.id, mapping: this.manifest.mapping },
    };

    return this.client.processRequest(options)
      .then((res) => {
        console.log('res', res);
        if (res.statusCode !== 200) throw new Error(res);

        return res[0];
      });
  }

  build(req: IncomingMessage): Promise<request.Options> {
    let api: string;

    return this.domainPromise
      .then((domain) => {
        api = `${domain}${req.url}`;

        return this.createContext();
      })
      .then((context, body) => {
        const jar = request.jar();

        const options = {
          jar,
          headers: this.prepareHeaders(req.headers, context.id),
          url: api,
          method: req.method,
          body: null,
        };

        return this.parseBody(req).then((body) => {
          options.body = body;

          return options;
        });
      });
  }

  private prepareHeaders(headers: IncomingHttpHeaders, context: string): IncomingHttpHeaders {
    const referer = (headers.referer.indexOf('?') >= 0)
      ? (`${headers.referer}&context=${context}`)
      : (`${headers.referer}?userId=27&customer=dev&locale=en-US&platform=desktop&context=${context}`);

    const newHeaders = {
      ...headers,
      referer,
      host: undefined,
    };

    return newHeaders;
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
  }
}
