import * as Promise from 'core-js/es6/promise';
import * as Domo from 'ryuu-client';
import * as Login from 'ryuu/util/login';
import * as request from 'request';

import { DomoException } from './lib/errors';

import {
  Manifest,
  DomoClient,
  NodeRequest,
  NodeResponse,
} from './lib/models';

export class DomoAppProxy {
  private manifest: Manifest;
  private client: DomoClient;
  private domainPromise: Promise;

  constructor(manifest: Manifest) {
    this.manifest = manifest;
    this.client = this.getLastLogin();
    this.domainPromise = this.getDomoDomain();
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
    const login = Login.getMostRecentLogin();

    return new Domo(login.instance, login.sid, login.devtoken);
  }

  getDomoDomain(): Promise<string> {
    const uuid = Domo.createUUID();
    const j = request.jar();
    const auth = `SID="${this.client.sid}"`;
    const cookie = request.cookie(auth);
    j.setCookie(cookie, this.client.server);

    const options = {
      url: `${this.client.server}/api/content/v1/mobile/environment`,
      headers: this.client.getAuthHeader(),
    };

    return new Promise((resolve, reject) => {
      request(options, (error, response, body) => {
        if (error) reject(`https://${uuid}.domoapps.${this.getEnv()}`);

        resolve(`https://${uuid}.${JSON.parse(body).domoappsDomain}`);
      });
    });
  }

  isValidRequest(url: string): boolean {
    const routes = ['/data/v1/', '/domo/v1/'];
    let isValid = false;

    routes.forEach((api) => {
      if (url.indexOf(api) > -1) isValid = true;
    });

    return isValid;
  }

  build(req: NodeRequest): Promise {
    if (!this.isValidRequest(req.url)) {
      const err = new DomoException('url provided is not a valid domo app endpoint');
      return Promise.reject(err);
    }

    let api: string;

    return this.domainPromise
      .then((domain) => {
        api = `${domain}${req.url}`;

        return this.createContext();
      })
      .then(([context]) => {
        const jar = request.jar();

        const referer = (req.headers.referer.indexOf('?') >= 0)
          ? (`${req.headers.referer}&context=${context.id}`)
          : (`${req.headers.referer}?userId=27&customer=dev&locale=en-US&platform=desktop&context=${context.id}`);

        const headers = {
          ...this.client.getAuthHeader(),
          referer,
          accept: req.headers.accept,
          'content-type': req.headers['content-type'] || req.headers['Content-Type'] || 'application/json',
        };

        const options = {
          jar,
          headers,
          url: api,
          method: req.method,
          body: JSON.stringify(req.body),
        };

        return options;
      });
  }

  createContext(): Promise {
    const options = {
      method: 'POST',
      url: `${this.client.server}/domoapps/apps/v2/contexts`,
      json: { designId: this.manifest.id, mapping: this.manifest.mapping },
      headers: this.client.getAuthHeader(),
    };

    return new Promise((resolve, reject) => {
      request(options, (error, response, body) => {
        if (error) reject(error);

        resolve(body);
      });
    });
  }

  getEnv(): string {
    const regexp = /([-_\w]+)\.(.*)/;
    const int = 2;

    return this.client.instance.match(regexp)[int];
  }

  express = () => (req: any, res: any, next: any): void => {
    this.build(req)
      .then(args => this.request(args).pipe(res))
      .catch(() => next());
  }

  stream = (req: any): Promise => {
    return this.build(req)
      .then(this.request);
  }

  request = options => request(options);
}
