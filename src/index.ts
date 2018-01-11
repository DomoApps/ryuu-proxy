import * as Promise from 'core-js/es6/promise';
import { Request, Response, NextFunction } from 'express';
import { IncomingMessage } from 'http';

import Transport from './lib/Transport';
import { DomoException } from './lib/errors';
import { Manifest } from './lib/models';

export class Proxy {
  private transport: Transport;

  constructor(manifest: Manifest) {
    this.transport = new Transport(manifest);
  }

  express = () => (req: Request, res: Response, next: NextFunction): Promise => {
    return (this.transport.isDomoRequest(req.url))
      ? (
        this.transport
          .build(req)
          .then(options => this.transport.request(options).pipe(res))
          .catch(err => res.status(err.statusCode || 500).send(err))
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
