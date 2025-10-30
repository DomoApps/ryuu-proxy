import * as path from 'path';
import * as os from 'os';
import FormData from 'form-data';
import { createWriteStream, createReadStream } from 'fs';
import { Request, Response, NextFunction } from 'express';
import { IncomingMessage } from 'http';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as dotenv from 'dotenv';
import busboy from 'busboy';

import Transport from './lib/Transport';
import { ProxyOptions } from './lib/models';

export class Proxy {
  private transport: Transport;

  private agent: HttpsProxyAgent<string> | undefined;

  constructor(config: ProxyOptions) {
    this.transport = new Transport(config);
    dotenv.config({ path: `${process.cwd()}/.env` });

    const proxyHost = process.env.REACT_APP_PROXY_HOST ?? process.env.PROXY_HOST;
    const proxyPort = process.env.REACT_APP_PROXY_PORT ?? process.env.PROXY_PORT;
    const proxyUsername = process.env.REACT_APP_PROXY_USERNAME ?? process.env.PROXY_USERNAME;
    const proxyPassword = process.env.REACT_APP_PROXY_PASSWORD ?? process.env.PROXY_PASSWORD;

    if (proxyHost !== undefined && proxyPort !== undefined) {
      if (proxyUsername !== undefined && proxyPassword !== undefined) {
        this.agent = new HttpsProxyAgent(`http://${proxyUsername}:${proxyPassword}@${proxyHost}:${proxyPort}`);
      } else {
        this.agent = new HttpsProxyAgent(`http://${proxyHost}:${proxyPort}`);
      }
    }
  }

  private onError = (
    err: Error & { response?: { data?: { statusCode?: number; statusMessage?: string } } },
    res: Response
  ) => {
    const status = err.response?.data?.statusCode !== undefined ? err.response.data.statusCode : 500;
    const msg =
      err.response?.data?.statusMessage !== undefined ? err.response.data.statusMessage : (err.message ?? err);

    res.status(status).send(msg);
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
            .then((options) => {
              const form = new FormData();
              form.append(fieldName, createReadStream(filePath));

              return this.transport.request({
                ...options,
                headers: { ...options.headers, ...form.getHeaders() },
                data: form,
              });
            })
            .then((rawRequest) => rawRequest.data.pipe(res))
            .catch((err) => this.onError(err, res));
        });

        return req.pipe(bb);
      }

      return this.transport
        .build(req)
        .then((options) =>
          this.transport.request({
            ...options,
            httpsAgent: this.agent,
          })
        )
        .then((rawRequest) => rawRequest.data.pipe(res))
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
