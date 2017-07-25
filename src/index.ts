import * as Promise from 'core-js/es6/promise';
import Transport from './lib/Transport';
import { DomoException } from './lib/errors';
import { Manifest } from './lib/models';

export class Proxy {
  private transport: Transport;

  constructor(manifest: Manifest) {
    this.transport = new Transport(manifest);
  }

  express = () => (req: any, res: any, next: any): Promise =>
    this.transport.build(req)
      .then(args => this.transport.get(args).pipe(res))
      .catch((err) => {
        if (err.name === 'DomoException') res.status(err.statusCode).json(err);
        else next();
      })

  stream = (req: any): Promise =>
    this.transport.build(req)
      .then(this.transport.get)
}
