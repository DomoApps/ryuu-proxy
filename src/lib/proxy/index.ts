import * as Promise from 'core-js/es6/promise';
import * as Domo from 'ryuu-client';
import * as Login from 'ryuu/util/login';
import * as request from 'request';
import * as http from 'http';
import { Manifest, DomoClient, DefaultRequest } from '../models';

export default class Proxy {
  manifest: Manifest;
  client: DomoClient;
  domainPromise: Promise;

  constructor(manifest: Manifest) {
    this.manifest = manifest;
    this.client = this.getDomoClient();
    this.domainPromise = this.getDomoDomain();
  }

  fetch(req: DefaultRequest, res: any): Promise {
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

        return request(options).pipe(res);
      });
  }

  getDomoClient(): DomoClient {
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

  createUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      /*tslint:disable no-bitwise*/
      const seed = 16;
      const bit11 = 0x3;
      const bit1000 = 0x8;

      const r = Math.random() * seed | 0;
      const v = (c === 'x') ? r : (r & bit11 | bit1000);

      return v.toString(seed);
      /*tslint:enable*/
    });
  }

  getEnv(): string {
    const regexp = /([-_\w]+)\.(.*)/;
    const int = 2;

    return this.client.instance.match(regexp)[int];
  }
}
