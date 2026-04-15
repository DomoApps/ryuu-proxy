import { describe, it, expect } from 'vitest';
import { DomoException } from './errors.js';

describe('DomoException', () => {
  it('should instantiate with error containing body.message', () => {
    const err = {
      body: { message: 'Test error message' },
      statusCode: 400,
    };
    const url = 'https://test.domo.com/data/v1/test';

    const exception = new DomoException(err, url);

    expect(exception).toBeInstanceOf(DomoException);
    expect(exception).toBeInstanceOf(Error);
    expect(exception.name).toBe('DomoException');
    expect(exception.error).toBe('Test error message');
    expect(exception.statusCode).toBe(400);
    expect(exception.url).toBe(url);
    expect(exception.proxy).toContain('domo login');
  });

  it('should use err.message when body.message is not available', () => {
    const err = {
      message: 'Direct error message',
      statusCode: 401,
    };
    const url = 'https://test.domo.com/dql/v1/query';

    const exception = new DomoException(err, url);

    expect(exception.error).toBe('Direct error message');
    expect(exception.statusCode).toBe(401);
  });

  it('should default to "Unknown error" when no message is available', () => {
    const err = {
      statusCode: 500,
    };
    const url = 'https://test.domo.com/api/test';

    const exception = new DomoException(err, url);

    expect(exception.error).toBe('Unknown error');
    expect(exception.statusCode).toBe(500);
  });

  it('should default statusCode to 500 when not provided', () => {
    const err = {
      body: { message: 'Error without status code' },
    };
    const url = 'https://test.domo.com/data/v1/test';

    const exception = new DomoException(err, url);

    expect(exception.statusCode).toBe(500);
  });

  it('should have correct error message content', () => {
    const err = {
      body: { message: 'Test error' },
      statusCode: 403,
    };
    const url = 'https://test.domo.com/test';

    const exception = new DomoException(err, url);

    expect(exception.message).toContain('manifest.json should have an Id');
    expect(exception.message).toContain('domo login');
    expect(exception.proxy).toBe(exception.message);
  });
});
