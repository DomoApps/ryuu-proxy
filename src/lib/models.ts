// Re-export Manifest type from ryuu-client
export type { Manifest } from "ryuu-client/lib/models";

export interface ProxyOptions {
  manifest: import("ryuu-client/lib/models").Manifest;
}

export interface OauthToken {
  access: string;
  refresh: string;
}
