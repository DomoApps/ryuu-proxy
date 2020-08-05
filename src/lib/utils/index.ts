import * as Domo from 'ryuu-client';
import * as glob from 'glob';
import * as fs from 'fs-extra';
import * as Promise from 'core-js/features/promise';
import * as Configstore from 'configstore';

import { OAUTH_ENABLED } from '../constants';
import { OauthToken, Manifest } from '../models';

export function getMostRecentLogin() {
  const home = Domo.getHomeDir();
  const logins = glob.sync(`${home} + *.json`);
  if (logins.length === 0) return Promise.resolve({});

  const recent = logins.reduce((prev, next) => {
    return fs.statSync(prev).mtime > fs.statSync(next).mtime ? prev : next;
  });
  const loginData = fs.readJsonSync(recent);
  const configstore = new Configstore(`${home}/${loginData.instance}.json`);
  loginData.refreshToken = configstore.get('refreshToken');
  return Promise.resolve(loginData);
}

export const isOauthEnabled = (manifest: Manifest): boolean =>
  (Object.keys(manifest).includes(OAUTH_ENABLED) && manifest[OAUTH_ENABLED]);

export const getProxyId = (manifest: Manifest): string =>
  (manifest.proxyId !== undefined && typeof manifest.proxyId === 'string')
    ? (manifest.proxyId)
    : (Domo.createUUID());

export function getOauthTokens(proxyId: string, scopes: string[] | undefined): Promise<OauthToken> {
  return getMostRecentLogin()
    .then((loginData) => {
      const configstore = new Configstore(`${Domo.getHomeDir()}/${loginData.instance}.json`);
      const allScopes = (scopes !== undefined)
        ? ([
          'domoapps',
          ...scopes,
        ])
        : (['domoapps']);

      return Promise.all([
        configstore.get(`${proxyId}-${allScopes.join('-')}-accessToken`),
        configstore.get(`${proxyId}-${allScopes.join('-')}-refreshToken`),
      ]);
    })
    .then((tokens: [string, string]) => ({ access: tokens[0], refresh: tokens[1] }));
}
