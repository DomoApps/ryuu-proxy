import { Manifest as RCManifest } from "ryuu-client/lib/models";

export type Manifest = RCManifest;

export interface ProxyOptions {
  manifest: Manifest;
}

export interface OauthToken {
  access: string;
  refresh: string;
}
