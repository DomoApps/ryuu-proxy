import * as Domo from 'ryuu-client';
import * as glob from 'glob';
import * as fs from 'fs-extra';
import * as keytar from 'keytar';
import * as Promise from 'core-js/es6/promise';

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

  return keytar.getPassword('domoapps-cli', loginData.instance).then((refreshToken) => {
    loginData.refreshToken = refreshToken;
    return loginData;
  });
}

export const isOauthEnabled = (manifest: Manifest): boolean =>
  (Object.keys(manifest).includes(OAUTH_ENABLED) && manifest[OAUTH_ENABLED]);

export function getOauthTokens(proxyId: string): Promise<OauthToken> {
  return getMostRecentLogin()
    .then((loginData) => {
      const instance = loginData.instance;
      const scopes = JSON.parse(loginData.scopes);

      return Promise.all([
        keytar.getPassword(`domoapps-oauth-access-${scopes.join('-')}`, `${instance}-${proxyId}`),
        keytar.getPassword(`domoapps-oauth-refresh-${scopes.join('-')}`, `${instance}-${proxyId}`),
      ]);
    })
    .then((tokens: [string, string]) => ({ access: tokens[0], refresh: tokens[1] }));
}
