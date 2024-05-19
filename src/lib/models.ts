import { Manifest } from "ryuu-client/lib/models";

export interface ProxyOptions {
  manifest: Manifest;
}

export interface OauthToken {
  access: string;
  refresh: string;
}
