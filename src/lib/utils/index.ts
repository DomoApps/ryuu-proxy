import * as Promise from 'core-js/es6/promise';
import * as Login from 'ryuu/util/login';
import * as Domo from 'ryuu-client';
import * as request from 'request';
import { Manifest, DomoClient } from '../models';

export function getDomoClient(): DomoClient {
  const login = Login.getMostRecentLogin();

  return new Domo(login.instance, login.sid, login.devtoken);
}

export function createContext(manifest: Manifest): Promise {
  const domo = getDomoClient();

  const options = {
    method: 'POST',
    url: `${domo.server}/domoapps/apps/v2/contexts`,
    json: { designId: manifest.id, mapping: manifest.mapping },
    headers: domo.getAuthHeader(),
  };

  return new Promise((resolve, reject) => {
    request(options, (error, response, body) => {
      if (error) reject(error);
      resolve(body);
    });
  });
}

export function getDomoDomain() {
  const domo = getDomoClient();
  const uuid = Domo.createUUID();
  const j = request.jar();
  const auth = `SID="${domo.sid}"`;
  const cookie = request.cookie(auth);
  j.setCookie(cookie, `https://${domo.instance}`);

  const options = {
    url: `https://${domo.instance}/api/content/v1/mobile/environment`,
    headers: domo.getAuthHeader(),
  };

  return new Promise((resolve, reject) => {
    request(options, (error, response, body) => {
      if (error) resolve(`https://${uuid}.domoapps.${getEnv(domo.instance)}`);
      resolve(`https://${uuid}.${JSON.parse(body).domoappsDomain}`);
    });
  });
}

export function createUUID(): string {
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

export function getEnv(instance) {
  const regexp = /([-_\w]+)\.(.*)/;
  const int = 2;

  return instance.match(regexp)[int];
}
