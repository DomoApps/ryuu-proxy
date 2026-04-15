import { randomUUID } from 'node:crypto';
import { getHomeDir } from 'ryuu-client';
import { globSync } from 'tinyglobby';
import * as fs from 'fs-extra';
import Configstore from 'configstore';

import type { Manifest } from 'ryuu-client';
import { OAUTH_ENABLED } from '../constants.js';
import type { OauthToken } from '../models.js';

export function getMostRecentLogin() {
  const home = getHomeDir();
  const logins = globSync(['*.json'], { cwd: `${home}/ryuu`, absolute: true });
  if (logins.length === 0) return Promise.resolve({});

  const recent = logins.reduce((prev, next) => (fs.statSync(prev).mtime > fs.statSync(next).mtime ? prev : next));
  const loginData = fs.readJsonSync(recent);
  const configstore = new Configstore(`/ryuu/${loginData.instance}`);
  loginData.refreshToken = configstore.get('refreshToken');
  loginData.devToken = configstore.get('devToken');
  return Promise.resolve(loginData);
}

export const isOauthEnabled = (manifest: Manifest): boolean =>
  Object.keys(manifest).includes(OAUTH_ENABLED) &&
  (manifest as unknown as Record<string, unknown>)[OAUTH_ENABLED] === true;

export const getProxyId = (manifest: Manifest): string => manifest.proxyId ?? randomUUID();

export function getOauthTokens(proxyId: string, scopes: string[] | undefined): Promise<OauthToken> {
  return getMostRecentLogin()
    .then((loginData) => {
      const configstore = new Configstore(`/ryuu/${loginData.instance}`);
      const allScopes = scopes !== undefined ? ['domoapps', ...scopes] : ['domoapps'];

      return Promise.all([
        configstore.get(`${proxyId}-${allScopes.join('-')}-accessToken`) as string,
        configstore.get(`${proxyId}-${allScopes.join('-')}-refreshToken`) as string,
      ]);
    })
    .then((tokens: [string, string]) => ({
      access: tokens[0],
      refresh: tokens[1],
    }));
}
