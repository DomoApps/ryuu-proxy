import * as Promise from 'core-js/es6/promise';
import  * as path from 'path';
import * as Busboy from 'busboy';
import * as os from 'os';
import { createWriteStream, createReadStream } from 'fs';
import { Request, Response, NextFunction } from 'express';
import { IncomingMessage } from 'http';

import Transport from './lib/Transport';
import { ProxyOptions } from './lib/models';

export class Proxy {
  private transport: Transport;

  constructor(config: ProxyOptions) {
    this.transport = new Transport(config);
  }

  private onError = (err, res: Response) => {
    const status = (typeof err.statusCode !== 'undefined') ? err.statusCode : 500;
    const msg = (err.body !== undefined) ? err.body : err;

    res.status(status).send(msg);
  }

  express = () => (req: Request, res: Response, next: NextFunction): Promise => {
    if (this.transport.isDomoRequest(req.url)) {
      if (this.transport.isMultiPartRequest(req.headers)) {
        const busboy = new Busboy({ headers: req.headers });
        let filePath: string;
        let fieldName: string;
        busboy.on('file', (fieldname, file, filename) => {
          filePath = path.join(os.tmpdir(), path.basename(filename));
          fieldName = fieldname;
          file.pipe(createWriteStream(filePath));
        });
        busboy.on('finish', () => {
          this.transport
            .buildBasic(req)
            .then((options) => {
              return this.transport.request({
                ...options,
                formData: {
                  [fieldName]: createReadStream(filePath),
                },
              });
            })
            .then(rawRequest => rawRequest.pipe(res))
            .catch(err => this.onError(err, res));
        });

        return req.pipe(busboy);
      }

      return this.transport
        .build(req)
        .then(options => this.transport.request(options))
        .then(rawRequest => rawRequest.pipe(res))
        .catch(err => this.onError(err, res));
    }

    return next();
  }

  stream = (req: IncomingMessage): Promise => {
    if (this.transport.isDomoRequest(req.url)) {
      return this.transport
        .build(req)
        .then(this.transport.request);
    }
  }
}
