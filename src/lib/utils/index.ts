import * as Domo from 'ryuu-client';
import * as glob from 'glob';
import * as fs from 'fs-extra';
import * as Promise from 'core-js/features/promise';

import { configstore } from './configstore';
import { OAUTH_ENABLED } from '../constants';
import { OauthToken, Manifest } from '../models';

export function getMostRecentLogin() {
  const home = Domo.getHomeDir();
  const logins = glob.sync(home + '/login/*.json');
  if (logins.length === 0) return Promise.resolve({});

  const recent = logins.reduce((prev, next) => {
    return fs.statSync(prev).mtime > fs.statSync(next).mtime ? prev : next;
  });
  const loginData = fs.readJsonSync(recent);

  const refreshToken = configstore.get(loginData.instance);
  loginData.refreshToken = refreshToken;
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
      const instance = loginData.instance;
      const allScopes = (scopes !== undefined)
        ? ([
          'domoapps',
          ...scopes,
        ])
        : (['domoapps']);

      return Promise.all([
        configstore.get(`${instance}-${proxyId}-${allScopes.join('-')}-accessToken`),
        configstore.get(`${instance}-${proxyId}-${allScopes.join('-')}-refreshToken`),
      ]);
    })
    .then((tokens: [string, string]) => ({ access: tokens[0], refresh: tokens[1] }));
}
