import * as Promise from 'core-js/es6/promise';
import * as sinon from 'sinon';
import * as nock from 'nock';
import * as Domo from 'ryuu-client';
import * as request from 'request';
import { expect } from 'chai';
import Proxy from '../Proxy';
import { Manifest, DomoClient } from '../models';

describe('lib: Proxy', () => {
  let client: Proxy;
  let manifest: Manifest;
  let clientStub;
  let promiseStub;

  beforeEach((done) => {
    // stub constructor dependencies
    clientStub = sinon.stub(Proxy.prototype, 'getDomoClient')
      .callsFake(() => new Domo('test.dev.domo.com', 'test-sid', 'test-token'));

    promiseStub = sinon.stub(Proxy.prototype, 'getDomoDomain')
      .callsFake(() => Promise.resolve('https://88e99055-1520-440c-99a0-7b2a27469391.domoapps.dev.domo.com'));

    manifest = {
      id: 'test-id',
      name: 'test-app',
      version: '1.0.0',
      sizing: { width: 1, height: 1 },
    };

    client = new Proxy(manifest);
    done();
  });

  afterEach(() => {
    clientStub.restore();
    promiseStub.restore();
  });

  it('should instantiate', () => {
    expect(Proxy).to.exist;
    expect(Proxy).to.be.an.instanceof(Function);

    expect(client).to.exist;
    expect(client).to.be.an.instanceof(Proxy);
    expect(client.manifest).to.exist;
    expect(client.manifest).to.be.equal(manifest);
    expect(client.client).to.exist;
    expect(client.client).to.be.an.instanceOf(Domo);
    expect(client.domainPromise).to.exist;
    expect(client.domainPromise).to.an.instanceOf(Promise);
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

  describe('createUUID()', () => {
    it('should instantiate', () => {
      expect(client.createUUID).to.exist;
      expect(client.createUUID).to.be.an.instanceOf(Function);
    });

    it('should return UUID formatted string', () => {
      const uuid: string = client.createUUID();
      const pattern = /[a-z0-9]{8}-([a-z0-9]{4}-){3}[a-z0-9]{12}/g;
      expect(pattern.test(uuid)).to.be.true;
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
      nock(client.client.server)
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
      nock(client.client.server).post('/domoapps/apps/v2/contexts').reply(OK, { id: 'test-context' });
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

  describe('fetch()', () => {
    beforeEach((done) => {
      client.domainPromise.then((domain) => {
        const OK = 200;
        nock(client.client.server).post('/domoapps/apps/v2/contexts').reply(OK, { id: 'test-context' });
        nock(domain).get('/data/v1/test').reply(OK);
        sinon.stub(request, 'pipe');
        done();
      });
    });

    it('should instantiate', () => {
      expect(client.fetch).to.exist;
      expect(client.fetch).to.be.an.instanceOf(Function);
    });
  });
});
