import * as Domo from 'ryuu-client';
import * as glob from 'glob';
import * as fs from 'fs-extra';
import * as keytar from 'keytar';
import * as Promise from 'core-js/es6/promise';

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
