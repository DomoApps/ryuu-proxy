import * as Promise from 'core-js/es6/promise';
import * as login from 'ryuu/util/login';
import * as sinon from 'sinon';
import * as nock from 'nock';
import * as Domo from 'ryuu-client';
import * as request from 'request';
import { expect } from 'chai';
import { DomoAppProxy } from '.';
import { Manifest, DomoClient } from './lib/models';

describe('DomoAppProxy', () => {
  let client: DomoAppProxy;
  let loginStub;

  const manifest: Manifest = {
    id: 'test-id',
    name: 'test-app',
    version: '1.0.0',
    sizing: { width: 1, height: 1 },
  };

  beforeEach(() => {
    loginStub = sinon.stub(login, 'getMostRecentLogin')
      .callsFake(() => ({ instance: 'test.dev.domo.com', sid: 'fake-sid' }));

    client = new DomoAppProxy(manifest);
  });

  afterEach(() => {
    loginStub.restore();
  });

  it('should instantiate', () => {
    expect(DomoAppProxy).to.exist;
    expect(DomoAppProxy).to.be.an.instanceof(Function);

    expect(client).to.exist;
    expect(client).to.be.an.instanceof(DomoAppProxy);
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
