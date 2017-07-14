import { Request, Response, NextFunction } from 'express';
import Proxy from './lib/Proxy';
import { Manifest, DefaultRequest } from './lib/models';

export const dataRoute = '/data/v1/';
export const domoRoute = '/domo/v1/';

export const express = (manifest: Manifest) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (req.url.indexOf(dataRoute) > -1 || req.url.indexOf(domoRoute) > -1) {
      const proxy = new Proxy(manifest);

      const options: DefaultRequest = {
        url: req.url,
        method: req.method,
        headers: req.headers,
        body: req.body,
      };

      proxy.fetch(options, res).catch(next);
    } else {
      next();
    }
  };

export function koa(opts) {
  // TODO
}
