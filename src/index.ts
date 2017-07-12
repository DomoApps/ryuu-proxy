import { Request, Response, NextFunction } from 'express';
import proxy from './lib/proxy';
import { Manifest } from './lib/models';

export const dataRoute = '/data/v1/';
export const domoRoute = '/domo/v1/';

export const express = (manifest: Manifest) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (req.url.indexOf(dataRoute) > -1 || req.url.indexOf(domoRoute) > -1) {
      proxy(manifest, req.url, req.headers, res).then(next).catch(next);
    } else {
      next();
    }
  };

export function koa(opts) {
  console.log(opts);
}
