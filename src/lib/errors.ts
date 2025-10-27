export class DomoException extends Error {
  statusCode: number;

  url: string;

  error: string;

  proxy: string;

  constructor(err: any, url: string) {
    const message = ''
      + 'Ensure the app has been published at least once (manifest.json should have an Id) '
      + 'and you\'re working with an active session by running: `domo login`';

    super(message);

    this.error = (err.body)
      ? (err.body.message)
      : (err.message);

    this.name = 'DomoException';
    this.proxy = message;
    this.statusCode = err.statusCode;
    this.url = url;
  }
}
