import * as Promise from 'core-js/es6/promise';
import * as Domo from 'ryuu-client';
import * as request from 'request';
import { IncomingMessage } from 'http';

import { getMostRecentLogin } from '../utils';
import { DomoException } from '../errors';
import { Manifest, DomoClient } from '../models';

export default class Transport {
  private manifest: Manifest;
  private client: DomoClient;
  private domainPromise: Promise;

  constructor(manifest: Manifest) {
    this.manifest = manifest;
    this.client = this.getLastLogin();
    this.domainPromise = this.getDomoDomain();
  }

  request = options => request(options);

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
    const recentLogin = getMostRecentLogin();

    return new Domo(recentLogin.instance, recentLogin.sid, recentLogin.devtoken);
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
        const env = this.getEnv(this.client.instance);

        if (error) reject(`https://${uuid}.domoapps.${env}`);

        resolve(`https://${uuid}.${JSON.parse(body).domoappsDomain}`);
      });
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

        if (response.statusCode !== 200) reject(response);

        resolve(body[0]);
      });
    });
  }

  build(req: IncomingMessage): Promise<request.CoreOptions> {
    let api: string;

    return this.domainPromise
      .then((domain) => {
        api = `${domain}${req.url}`;

        return this.createContext();
      })
      .then((context, body) => {
        const jar = request.jar();

        const referer = (req.headers.referer.indexOf('?') >= 0)
          ? (`${req.headers.referer}&context=${context.id}`)
          : (`${req.headers.referer}?userId=27&customer=dev&locale=en-US&platform=desktop&context=${context.id}`);

        const headers = {
          ...req.headers,
          ...this.client.getAuthHeader(),
          referer,
        };

        // delete original headers that don't mess with service
        delete headers.host;

        const options = {
          jar,
          headers,
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

  private parseBody(req: IncomingMessage): Promise<string|void> {
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
}
