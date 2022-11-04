import * as Promise from "core-js/features/promise";
import * as path from "path";
import * as os from "os";
import * as FormData from "form-data";
import { createWriteStream, createReadStream } from "fs";
import { Request, Response, NextFunction } from "express";
import { IncomingMessage } from "http";
import HttpsProxyAgent = require("https-proxy-agent");
import * as dotenv from "dotenv";

import Transport from "./lib/Transport";
import { ProxyOptions } from "./lib/models";
const busboy = require("busboy");

export class Proxy {
  private transport: Transport;
  private agent;

  constructor(config: ProxyOptions) {
    this.transport = new Transport(config);
    dotenv.config({ path: process.cwd() + "/.env" });
    if (
      (process.env.REACT_APP_PROXY_HOST ?? process.env.PROXY_HOST) !==
        undefined &&
      (process.env.REACT_APP_PROXY_PORT ?? process.env.PROXY_PORT) !== undefined
    ) {
      if (
        (process.env.REACT_APP_PROXY_USERNAME ?? process.env.PROXY_USERNAME) !==
          undefined &&
        (process.env.REACT_APP_PROXY_PASSWORD ?? process.env.PROXY_PASSWORD) !==
          undefined
      ) {
        //@ts-ignore
        this.agent = new HttpsProxyAgent(
          "http://" +
            (process.env.REACT_APP_PROXY_USERNAME ??
              process.env.PROXY_USERNAME) +
            ":" +
            (process.env.REACT_APP_PROXY_PASSWORD ??
              process.env.PROXY_PASSWORD) +
            "@" +
            (process.env.REACT_APP_PROXY_HOST ?? process.env.PROXY_HOST) +
            ":" +
            (process.env.REACT_APP_PROXY_PORT ?? process.env.PROXY_PORT)
        );
      } else {
        //@ts-ignore
        this.agent = new HttpsProxyAgent(
          "http://" +
            (process.env.REACT_APP_PROXY_HOST ?? process.env.PROXY_HOST) +
            ":" +
            (process.env.REACT_APP_PROXY_PORT ?? process.env.PROXY_PORT)
        );
      }
    }
  }

  private onError = (err, res: Response) => {
    const status =
      typeof err.response.data.statusCode !== "undefined"
        ? err.response.data.statusCode
        : 500;
    const msg =
      err.response.data.statusMessage !== undefined
        ? err.response.data.statusMessage
        : err;

    res.status(status).send(msg);
  };

  express =
    () =>
    (req: Request, res: Response, next: NextFunction): Promise => {
      if (this.transport.isDomoRequest(req.url)) {
        if (this.transport.isMultiPartRequest(req.headers)) {
          const bb = busboy({ headers: req.headers });
          let filePath: string;
          let fieldName: string;
          bb.on("file", (fieldname, file, filename) => {
            filePath = path.join(os.tmpdir(), path.basename(filename));
            fieldName = fieldname;
            file.pipe(createWriteStream(filePath));
          });
          bb.on("finish", () => {
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
          .then((options) => {
            return this.transport.request({
              ...options,
              httpsAgent: this.agent,
            });
          })
          .then((rawRequest) => rawRequest.data.pipe(res))
          .catch((err) => this.onError(err, res));
      }

      return next();
    };

  stream = (req: IncomingMessage): Promise => {
    if (this.transport.isDomoRequest(req.url)) {
      return this.transport.build(req).then(this.transport.request);
    }
  };
}
