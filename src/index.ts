import * as path from 'path';
import * as os from 'os';
import { createWriteStream } from 'fs';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { Request, Response, NextFunction } from 'express';
import { IncomingMessage } from 'http';

import Transport from './lib/Transport/index.js';
import type { ProxyOptions } from './lib/models.js';
import busboy from 'busboy';

export class Proxy {
  private transport: Transport;

  constructor(config: ProxyOptions) {
    this.transport = new Transport(config);
  }

  private onError = (
    err: Error & { status?: number; statusCode?: number; response?: { data?: { statusCode?: number; statusMessage?: string } } },
    res: Response
  ) => {
    const status = err.status ?? err.statusCode ?? err.response?.data?.statusCode ?? 500;
    const msg = err.response?.data?.statusMessage ?? err.message ?? 'Unknown error';

    res.status(status).send(msg);
  };

  private pipeResponse = (response: globalThis.Response, res: Response) => {
    res.status(response.status);

    // Forward relevant headers from upstream
    response.headers.forEach((value, key) => {
      // Skip hop-by-hop headers
      if (!['transfer-encoding', 'connection', 'keep-alive'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    if (response.body) {
      Readable.fromWeb(response.body as any).pipe(res);
    } else {
      res.end();
    }
  };

  express = () => (req: Request, res: Response, next: NextFunction) => {
    if (this.transport.isDomoRequest(req.url)) {
      if (this.transport.isMultiPartRequest(req.headers)) {
        const bb = busboy({ headers: req.headers });
        let filePath: string;
        let fieldName: string;
        bb.on('file', (fieldname, filestream, fileMetadata) => {
          filePath = path.join(os.tmpdir(), path.basename(fileMetadata.filename));
          fieldName = fieldname;
          filestream.pipe(createWriteStream(filePath));
        });
        bb.on('finish', () => {
          this.transport
            .buildBasic(req)
            .then(async (options) => {
              const fileBuffer = await readFile(filePath);
              const form = new FormData();
              form.append(fieldName, new Blob([fileBuffer]), path.basename(filePath));

              return this.transport.request({
                ...options,
                body: form,
              });
            })
            .then((response) => this.pipeResponse(response, res))
            .catch((err) => this.onError(err, res));
        });

        return req.pipe(bb);
      }

      return this.transport
        .build(req)
        .then((options) => this.transport.request(options))
        .then((response) => this.pipeResponse(response, res))
        .catch((err) => this.onError(err, res));
    }

    return next();
  };

  stream = (req: IncomingMessage) => {
    if (this.transport.isDomoRequest(req.url)) {
      return this.transport
        .build(req)
        .then(this.transport.request)
        .catch((err) => {
          // Re-throw the error so callers can handle it
          throw err;
        });
    }
    return undefined;
  };
}
