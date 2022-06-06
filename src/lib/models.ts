import { AxiosRequestConfig } from 'axios';
export interface DomoClient {
  instance: string;
  server: string;
  devtoken: string;
  sid: string;
  getAuthHeader(): any;
  createUUID(): string;
  processRequest(options: any): Promise<any>;
  processRequestRaw(options: any): Promise<any>;
  getDomoappsURL(params: any): Promise<any>;
}

export interface ProxyOptions {
  manifest: Manifest;
}

export interface FieldMap {
  alias: string;
  columnName: string;
}

export interface DatasetMap {
  dataSetId: string;
  alias: string;
  fields: FieldMap[];
}

export interface Manifest {
  id: string;
  name: string;
  version: string;
  mapping?: DatasetMap[];
  sizing: {
    width: number;
    height: number;
  };
  oAuthEnabled?: boolean;
  scopes?: string[];
  proxyId?: string;
}

export interface OauthToken {
  access: string;
  refresh: string;
}
