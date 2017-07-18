import * as http from 'http';

export interface DomoClient {
  instance: string;
  server: string;
  devtoken: string;
  sid: string;
  getAuthHeader(): any;
  createUUID(): string;
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
}

export interface NodeRequest extends http.IncomingMessage {
  url: string;
  method: string;
  headers: {
    referer: string,
    accept?: string,
  };
  body?: string;
}

export interface NodeResponse extends http.ServerResponse {}
