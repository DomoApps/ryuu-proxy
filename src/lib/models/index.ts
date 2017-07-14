import * as http from 'http';

export interface DomoClient {
  instance: string;
  server: string;
  devtoken: string;
  sid: string;
  getAuthHeader(): any;
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

export interface DefaultRequest {
  url: string;
  method: string;
  headers: {
    referer: string,
    accept: string,
  };
  body: string;
}
