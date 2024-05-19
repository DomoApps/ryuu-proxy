import Domo = require("ryuu-client");
import * as axios from "axios";
import { Request } from "express";
import { IncomingMessage, IncomingHttpHeaders } from "http";
const axiosCookieJarSupport = require("axios-cookiejar-support").default;
const tough = require("tough-cookie");

import {
  getMostRecentLogin,
  getProxyId,
  isOauthEnabled,
  getOauthTokens,
} from "../utils";
import { ProxyOptions, OauthToken } from "../models";
import { CLIENT_ID } from "../constants";
import * as dotenv from "dotenv";
import { Manifest } from "ryuu-client/lib/models";

export default class Transport {
  private manifest: Manifest;
  private clientPromise: Promise<Domo>;
  private domainPromise: Promise<any>;
  private proxyId;
  private oauthTokenPromise: Promise<OauthToken | undefined>;

  constructor({ manifest }: ProxyOptions) {
    this.manifest = manifest;
    //@ts-ignore
    this.clientPromise = this.getLastLogin();
    this.proxyId = getProxyId(manifest);
    this.domainPromise = this.clientPromise.then(async (client) => {
      return client.getDomoappsData({ ...this.manifest }, this.proxyId);
    });
    this.oauthTokenPromise = this.getScopedOauthTokens();
  }

  request = (options: axios.AxiosRequestConfig): any =>
    this.clientPromise.then((client) => client.processRequestRaw(options));

  getEnv(instance: string): string {
    const regexp = /([-_\w]+)\.(.*)/;
    const int = 2;

    return instance.match(regexp)[int];
  }

  isDomoRequest(url: string): boolean {
    const domoPattern = /^\/domo\/.+\/v\d/;
    const dataPattern = /^\/data\/v\d\/.+/;
    const sqlQueryPattern = /^\/sql\/v\d\/.+/;
    const dqlPattern = /^\/dql\/v\d\/.+/;
    const apiPattern = /^\/api\/.+/;

    return (
      domoPattern.test(url) ||
      dataPattern.test(url) ||
      sqlQueryPattern.test(url) ||
      dqlPattern.test(url) ||
      apiPattern.test(url)
    );
  }

  isMultiPartRequest(headers: IncomingHttpHeaders): boolean {
    return Object.entries(headers).some(
      ([header, value]) =>
        header.toLowerCase() === "content-type" &&
        value.toString().toLowerCase().includes("multipart")
    );
  }

  getManifest(): Manifest {
    return this.manifest;
  }

  getDomainPromise(): Promise<any> {
    return this.domainPromise;
  }

  getLastLogin(): Promise<Domo> {
    return getMostRecentLogin()
      .then(this.verifyLogin)
      .then((recentLogin) => {
        dotenv.config({ path: process.cwd() + "/.env" });
        if (
          (process.env.REACT_APP_PROXY_HOST ?? process.env.PROXY_HOST) !==
            undefined &&
          (process.env.REACT_APP_PROXY_PORT ?? process.env.PROXY_PORT) !==
            undefined
        ) {
          if (
            (process.env.REACT_APP_PROXY_USERNAME ??
              process.env.PROXY_USERNAME) !== undefined &&
            (process.env.REACT_APP_PROXY_PASSWORD ??
              process.env.PROXY_PASSWORD) !== undefined
          ) {
            return new Domo(
              recentLogin.instance,
              recentLogin.refreshToken,
              CLIENT_ID,
              {
                host: process.env.REACT_APP_PROXY_HOST,
                port: process.env.REACT_APP_PROXY_PORT,
                //@ts-ignore
                username: process.env.REACT_APP_PROXY_USERNAME,
                password: process.env.REACT_APP_PROXY_PASSWORD,
              },
              recentLogin.devToken
            );
          } else {
            return new Domo(
              recentLogin.instance,
              recentLogin.refreshToken,
              CLIENT_ID,
              {
                host: process.env.REACT_APP_PROXY_HOST,
                port: process.env.REACT_APP_PROXY_PORT,
              },
              recentLogin.devToken
            );
          }
        }
        //@ts-ignore
        return new Domo(
          recentLogin.instance,
          recentLogin.refreshToken,
          CLIENT_ID,
          {},
          recentLogin.devToken
        );
      });
  }

  getScopedOauthTokens(): Promise<OauthToken | undefined> {
    if (isOauthEnabled(this.manifest)) {
      return getOauthTokens(this.proxyId, this.manifest.scopes);
    }

    return new Promise((resolve) => resolve(undefined));
  }

  build(req: IncomingMessage): Promise<axios.AxiosRequestConfig> {
    let options;
    return this.buildBasic(req)
      .then((basicOptions) => {
        options = basicOptions;
        options.transformResponse = [];
        options.responseType = "stream";
        return this.parseBody(req);
      })
      .then((data) => {
        return {
          ...options,
          data,
        };
      });
  }

  buildBasic(req: IncomingMessage): Promise<axios.AxiosRequestConfig> {
    let api: string;
    let hostname: string;
    //@ts-ignore
    return this.domainPromise
      .then((domain) => {
        api = `${domain.url}${req.url}`;
        hostname = domain.url;
        return this.prepareHeaders(req.headers, this.proxyId, hostname);
      })
      .then((headers) => {
        axiosCookieJarSupport(axios);
        const cookieJar = new tough.CookieJar();
        const jar = cookieJar;

        return {
          jar,
          headers,
          url: api,
          responseType: "stream",
          method: req.method,
        };
      });
  }

  private prepareHeaders(
    headers: IncomingHttpHeaders,
    context: string,
    host: string
  ): Promise<IncomingHttpHeaders> {
    const hostname = host.replace("https://", "");
    return this.oauthTokenPromise.then((tokens: OauthToken | undefined) => {
      if (!headers.hasOwnProperty("referer"))
        headers.referer = "https://0.0.0.0:3000";
      const referer =
        headers.referer.indexOf("?") >= 0
          ? `${headers.referer}`
          : `${headers.referer}?userId=27&customer=dev&locale=en-US&platform=desktop`;

      const cookieHeader = this.prepareCookies(headers, tokens);

      const filters: string[] = this.isMultiPartRequest(headers)
        ? ["content-type", "content-length", "cookie"]
        : ["cookie"];

      return {
        ...Object.keys(headers).reduce((newHeaders, key) => {
          if (!filters.includes(key.toLowerCase())) {
            newHeaders[key] = headers[key];
          }
          return newHeaders;
        }, {}),
        ...cookieHeader,
        referer,
        host: hostname,
      };
    });
  }

  private prepareCookies(
    headers: IncomingHttpHeaders,
    tokens: OauthToken | undefined
  ): { cookie: string } | {} {
    const existingCookie = Object.keys(headers).reduce((newHeaders, key) => {
      if (key.toLowerCase() === "cookie") {
        // handle if cookie is an array
        if (Array.isArray(headers[key])) {
          newHeaders["cookie"] = (headers[key] as string[]).join("; ");
        } else {
          newHeaders["cookie"] = headers[key] as string;
        }
      }
      return newHeaders;
    }, {});

    const tokenCookie =
      tokens !== undefined
        ? { cookie: `_daatv1=${tokens.access}; _dartv1=${tokens.refresh}` }
        : {};

    if (
      existingCookie["cookie"] !== undefined &&
      tokenCookie["cookie"] !== undefined
    ) {
      return {
        cookie: `${existingCookie["cookie"]}; ${tokenCookie["cookie"]}`,
      };
    }

    if (existingCookie["cookie"] === undefined) {
      return tokenCookie;
    }

    return existingCookie;
  }

  private parseBody(req: IncomingMessage): Promise<string | void> {
    // if body-parser was used before this middleware the "body" attribute will be set
    const exprReq = req as Request;
    if (typeof exprReq.body !== "undefined") {
      if (typeof exprReq.body === "string")
        return Promise.resolve(exprReq.body);
      return Promise.resolve(JSON.stringify(exprReq.body));
    }

    return new Promise((resolve) => {
      const body = [];

      try {
        req.on("data", (chunk) => body.push(chunk));

        req.on("end", () => {
          const raw = Buffer.concat(body).toString();
          resolve(raw);
        });

        req.on("error", () => resolve(null));
      } catch (e) {
        resolve();
      }
    });
  }

  private verifyLogin(login) {
    if (!login.refreshToken) {
      throw new Error('Not authenticated. Please login using "domo login"');
    }

    return login;
  }
}
