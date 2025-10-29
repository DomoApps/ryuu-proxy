import { expect } from 'chai';
import { DomoException } from './errors';

describe('DomoException', () => {
  it('should instantiate with error containing body.message', () => {
    const err = {
      body: { message: 'Test error message' },
      statusCode: 400,
    };
    const url = 'https://test.domo.com/data/v1/test';

    const exception = new DomoException(err, url);

    expect(exception).to.be.instanceOf(DomoException);
    expect(exception).to.be.instanceOf(Error);
    expect(exception.name).to.equal('DomoException');
    expect(exception.error).to.equal('Test error message');
    expect(exception.statusCode).to.equal(400);
    expect(exception.url).to.equal(url);
    expect(exception.proxy).to.include('domo login');
  });

  it('should use err.message when body.message is not available', () => {
    const err = {
      message: 'Direct error message',
      statusCode: 401,
    };
    const url = 'https://test.domo.com/dql/v1/query';

    const exception = new DomoException(err, url);

    expect(exception.error).to.equal('Direct error message');
    expect(exception.statusCode).to.equal(401);
  });

  it('should default to "Unknown error" when no message is available', () => {
    const err = {
      statusCode: 500,
    };
    const url = 'https://test.domo.com/api/test';

    const exception = new DomoException(err, url);

    expect(exception.error).to.equal('Unknown error');
    expect(exception.statusCode).to.equal(500);
  });

  it('should default statusCode to 500 when not provided', () => {
    const err = {
      body: { message: 'Error without status code' },
    };
    const url = 'https://test.domo.com/data/v1/test';

    const exception = new DomoException(err, url);

    expect(exception.statusCode).to.equal(500);
  });

  it('should have correct error message content', () => {
    const err = {
      body: { message: 'Test error' },
      statusCode: 403,
    };
    const url = 'https://test.domo.com/test';

    const exception = new DomoException(err, url);

    expect(exception.message).to.include('manifest.json should have an Id');
    expect(exception.message).to.include('domo login');
    expect(exception.proxy).to.equal(exception.message);
  });
});
