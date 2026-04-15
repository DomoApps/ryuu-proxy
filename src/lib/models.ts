export type { Manifest } from 'ryuu-client';

export interface ProxyOptions {
  manifest: import('ryuu-client').Manifest;
}

export interface OauthToken {
  access: string;
  refresh: string;
}

export interface ProxyRequestOptions {
  url: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: any;
}
