import * as Promise from 'core-js/es6/promise';
import { Request, Response, NextFunction } from 'express';
import Transport from './lib/Transport';
import { DomoException } from './lib/errors';
import { Manifest } from './lib/models';

export class Proxy {
  private transport: Transport;

  constructor(manifest: Manifest) {
    this.transport = new Transport(manifest);
  }

  express = () => (req: Request, res: Response, next: NextFunction): Promise => (
    this.transport
      .build(req)
      .then(options => this.transport.request(options).pipe(res))
      .catch((err) => {
        if (err.name === 'DomoException') {
          res.status(err.statusCode).json(err);
        } else {
          next();
        }
      })
  )

  stream = (req: Request): Promise => (
    this.transport
      .build(req)
      .then(this.transport.request)
  )
}
