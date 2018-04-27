import * as Promise from 'core-js/es6/promise';
import { Request, Response, NextFunction } from 'express';
import { IncomingMessage } from 'http';

import Transport from './lib/Transport';
import { DomoException } from './lib/errors';
import { ProxyOptions, Manifest } from './lib/models';

export class Proxy {
  private transport: Transport;

  constructor(config: ProxyOptions) {
    this.transport = new Transport(config);
  }

  express = () => (req: Request, res: Response, next: NextFunction): Promise => {
    return (this.transport.isDomoRequest(req.url))
      ? (
        this.transport
          .build(req)
          .then(options => this.transport.request(options).pipe(res))
          .catch((err) => {
            const status = err.statusCode || 500;
            const msg = (err.body !== undefined) ? err.body : err;

            res.status(status).send(msg);
          })
        )
      : next();
  }

  stream = (req: IncomingMessage): Promise => {
    if (this.transport.isDomoRequest(req.url)) {
      return this.transport
        .build(req)
        .then(this.transport.request);
    }
  }
}
