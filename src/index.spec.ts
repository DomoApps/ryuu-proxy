import * as Promise from 'core-js/es6/promise';
import * as sinon from 'sinon';
import * as nock from 'nock';
import * as Domo from 'ryuu-client';
import * as request from 'request';
import { expect } from 'chai';
import { DomoAppProxy } from '.';
import { Manifest, DomoClient } from './lib/models';

describe('DomoAppProxy', () => {
  let client: DomoAppProxy;
  let manifest: Manifest;
  let clientStub;
  let promiseStub;

  beforeEach((done) => {
    // stub constructor dependencies
    clientStub = sinon.stub(DomoAppProxy.prototype, 'getLastLogin')
      .callsFake(() => new Domo('test.dev.domo.com', 'test-sid', 'test-token'));

    promiseStub = sinon.stub(DomoAppProxy.prototype, 'getDomoDomain')
      .callsFake(() => Promise.resolve('https://88e99055-1520-440c-99a0-7b2a27469391.domoapps.dev.domo.com'));

    manifest = {
      id: 'test-id',
      name: 'test-app',
      version: '1.0.0',
      sizing: { width: 1, height: 1 },
    };

    client = new DomoAppProxy(manifest);
    done();
  });

  afterEach(() => {
    clientStub.restore();
    promiseStub.restore();
  });

  it('should instantiate', () => {
    expect(DomoAppProxy).to.exist;
    expect(DomoAppProxy).to.be.an.instanceof(Function);

    expect(client).to.exist;
    expect(client).to.be.an.instanceof(DomoAppProxy);
    expect(client.getManifest()).to.exist;
    expect(client.getManifest()).to.be.equal(manifest);
    expect(client.getDomoClient()).to.exist;
    expect(client.getDomoClient()).to.be.an.instanceOf(Domo);
    expect(clientStub.calledOnce).to.be.true;
    expect(promiseStub.calledOnce).to.be.true;
  });

  describe('getDomoClient()', () => {
    it('should instantiate', () => {
      expect(client.getDomoClient).to.exist;
      expect(client.getDomoClient).to.be.an.instanceOf(Function);
    });

    it('should return Domo Client', () => {
      const domoClient: DomoClient = client.getDomoClient();
      expect(domoClient).to.exist;
      expect(domoClient).to.be.an.instanceOf(Domo);
    });
  });

  describe('getEnv()', () => {
    it('should instantiate', () => {
      expect(client.getEnv).to.exist;
      expect(client.getEnv).to.be.an.instanceOf(Function);
    });

    it('should return env from instance string', () => {
      const env: string = client.getEnv();
      expect(env).to.equal('dev.domo.com');
    });
  });

  describe('getDomoDomain()', () => {
    beforeEach(() => {
      const OK = 200;
      nock(client.getDomoClient().server)
        .get('/api/content/v1/mobile/environment')
        .reply(OK, JSON.stringify({ domoappsDomain: 'domoapps.dev2.domo.com' }));

      // clear existing stubs
      promiseStub.restore();
    });

    it('should instantiate', () => {
      expect(client.getDomoDomain).to.exist;
      expect(client.getDomoDomain).to.be.an.instanceOf(Function);
    });

    it('should return promise that resolves URL', (done) => {
      const promise: Promise = client.getDomoDomain();
      expect(promise).to.exist;
      promise.then((res) => {
        const pattern = /^https:\/\/[a-z0-9\-]{36}.domoapps.dev2.domo.com/g;
        expect(res).to.exist;
        expect(pattern.test(res)).to.be.true;
        done();
      });
    });
  });

  describe('createContext()', () => {
    beforeEach(() => {
      const OK = 200;
      nock(client.getDomoClient().server).post('/domoapps/apps/v2/contexts').reply(OK, { id: 'test-context' });
    });

    it('should instantiate', () => {
      expect(client.createContext).to.exist;
      expect(client.createContext).to.be.an.instanceOf(Function);
    });

    it('should return promise', (done) => {
      const promise: Promise = client.createContext();
      expect(promise).to.exist;
      promise.then((res) => {
        expect(res).to.exist;
        expect(res.id).to.equal('test-context');
        done();
      });
    });
  });

  describe('build()', () => {
    it('should instantiate', () => {
      expect(client.build).to.exist;
      expect(client.build).to.be.an.instanceOf(Function);
    });
  });

  describe('isValidRequest()', () => {
    it('should instantiate', () => {
      expect(client.isValidRequest).to.exist;
      expect(client.isValidRequest).to.be.an.instanceOf(Function);
    });

    it('should check for domo app api request', () => {
      const badUrl = '/url/that/should/fail';
      const goodUrl = '/data/v1/sales?sum=help';

      expect(client.isValidRequest(badUrl)).to.be.false;
      expect(client.isValidRequest(goodUrl)).to.be.true;
    });
  });

  describe('express()', () => {
    it('should instantiate', () => {
      expect(client.express).to.exist;
      expect(client.express).to.be.an.instanceOf(Function);
    });

    it('should call build()', () => {
      const stub = sinon.stub(client, 'build')
        .callsFake(() => Promise.reject());

      const empty = client.express()({}, {}, () => '');
      expect(empty).to.not.exist;
      expect(stub.calledOnce).to.be.true;
      stub.restore();
    });
  });

  describe('stream()', () => {
    it('should instantiate', () => {
      expect(client.stream).to.exist;
      expect(client.stream).to.be.an.instanceOf(Function);
    });

    it('should call build()', (done) => {
      const stub = sinon.stub(client, 'build')
        .callsFake(() => Promise.reject());

      const promise = client.stream({});

      expect(promise).to.exist;
      expect(promise).to.be.an.instanceOf(Promise);

      promise.catch(() => {
        expect(stub.calledOnce).to.be.true;
        stub.restore();
        done();
      });
    });
  });
});
