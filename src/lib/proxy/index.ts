import * as Promise from 'core-js/es6/promise';
import * as request from 'request';
import { Manifest } from '../models';
import { getDomoClient, getDomoDomain, createContext } from '../utils';

export default function proxy(manifest: Manifest, url: string, reqHeaders: any, res: any) {
  let api: string;
  const domo = getDomoClient();

  return getDomoDomain()
    .then(domain => api = `${domain}${url}`)
    .then(() => createContext(manifest))
    .then((context) => {
      const jar = request.jar();

      const referer = (reqHeaders.referer.indexOf('?') >= 0)
        ? (`${reqHeaders.referer}&context=${context.id}`)
        : (`${reqHeaders.referer}
            ?userId=27&customer=dev&locale=en-US&platform=desktop
            &context=${context.id}`);

      const headers = {
        ...domo.getAuthHeader(),
        referer,
        accept: reqHeaders.accept,
        'content-type': reqHeaders['content-type'] || reqHeaders['Content-Type'] || 'application/json',
      };

      return request({ url, jar, headers }).pipe(res);
    });
}
