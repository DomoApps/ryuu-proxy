export class DomoException extends Error {
  static class = 'DomoException';

  constructor(message: string) {
    super(message);

    this.name = 'DomoException';
  }
}
