export class DomoException extends Error {
  statusCode: number;

  url: string;

  error: string;

  proxy: string;

  constructor(err: { body?: { message?: string }; message?: string; statusCode?: number }, url: string) {
    const message =
      'Ensure the app has been published at least once (manifest.json should have an Id) ' +
      'and you are working with an active session by running: `domo login`';

    super(message);

    this.error = err.body?.message ?? err.message ?? 'Unknown error';

    this.name = 'DomoException';
    this.proxy = message;
    this.statusCode = err.statusCode ?? 500;
    this.url = url;
  }
}
