import * as Promise from 'core-js/features/promise';
import * as sinon from 'sinon';
import * as Domo from 'ryuu-client';
import { expect } from 'chai';
import { Proxy } from '.';
import { Manifest } from './lib/models';
import Transport from './lib/Transport';

describe('Proxy', () => {
  let client: Proxy;
  let clientStub;

  const manifest: Manifest = {
    id: 'test-id',
    name: 'test-app',
    version: '1.0.0',
    sizing: { width: 1, height: 1 },
  };

  beforeEach(() => {
    clientStub = sinon.stub(Transport.prototype, 'getLastLogin')
      .returns(Promise.resolve(new Domo('test.dev.domo.com', 'test-sid', 'test-token')));

    client = new Proxy({ manifest });
  });

  afterEach(() => {
    clientStub.restore();
  });

  it('should instantiate', () => {
    expect(Proxy).to.exist;
    expect(Proxy).to.be.an.instanceof(Function);

    expect(client).to.exist;
    expect(client).to.be.an.instanceof(Proxy);
  });

  describe('express()', () => {
    it('should instantiate', () => {
      expect(client.express).to.exist;
      expect(client.express).to.be.an.instanceOf(Function);
    });

    it('should return express middleware', () => {
      const func = client.express();
      expect(func).to.exist;
      expect(func).to.be.an.instanceof(Function);
      expect(func.length).to.be.equal(3);
    });
  });

  describe('stream()', () => {
    it('should instantiate', () => {
      expect(client.stream).to.exist;
      expect(client.stream).to.be.an.instanceOf(Function);
    });
  });
});
