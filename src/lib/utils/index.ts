import * as Domo from 'ryuu-client';
import * as glob from 'glob';
import * as fs from 'fs-extra';

export function getMostRecentLogin() {
  const home = Domo.getHomeDir();
  const logins = glob.sync(home + '/login/*.json');
  if (logins.length === 0) return {};

  const recent = logins.reduce((prev, next) => {
    return fs.statSync(prev).mtime > fs.statSync(next).mtime ? prev : next;
  });
  return fs.readJsonSync(recent);
}
