import Domo = require('ryuu-client');
import { globSync } from 'glob';
import * as fs from 'fs-extra';
import Configstore from 'configstore';

import { Manifest } from 'ryuu-client/lib/models';
import { OAUTH_ENABLED } from '../constants';
import { OauthToken } from '../models';

export function getMostRecentLogin() {
  const home = Domo.getHomeDir();
  const logins = globSync(`${home}/ryuu/*.json`);
  if (logins.length === 0) return Promise.resolve({});

  const recent = logins.reduce((prev, next) => (fs.statSync(prev).mtime > fs.statSync(next).mtime ? prev : next));
  const loginData = fs.readJsonSync(recent);
  const configstore = new Configstore(`/ryuu/${loginData.instance}`);
  loginData.refreshToken = configstore.get('refreshToken');
  loginData.devToken = configstore.get('devToken');
  return Promise.resolve(loginData);
}

export const isOauthEnabled = (manifest: Manifest): boolean => (
  Object.keys(manifest).includes(OAUTH_ENABLED) && (manifest as any)[OAUTH_ENABLED]
);

export const getProxyId = (manifest: Manifest): string => manifest.proxyId ?? Domo.createUUID();

export function getOauthTokens(
  proxyId: string,
  scopes: string[] | undefined,
): Promise<OauthToken> {
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
