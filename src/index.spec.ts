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

  describe('fetch()', () => {
    beforeEach((done) => {
      client.getDomainPromise().then((domain) => {
        const OK = 200;
        nock(client.getDomoClient().server).post('/domoapps/apps/v2/contexts').reply(OK, { id: 'test-context' });
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

  describe('formatParams()', () => {
    it('should instantiate', () => {
      expect(client.formatParams).to.exist;
      expect(client.formatParams).to.be.an.instanceOf(Function);
    });

    it('should handle koa ctx', () => {
      const fakeCtx = { req: 'foo', res: 'bar' };
      const fakeNxt = () => 'hallo';

      const params = client.formatParams(fakeCtx, fakeNxt, undefined);

      expect(params.req).to.equal('foo');
      expect(params.res).to.equal('bar');
      expect(params.next).to.equal(fakeNxt);
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

  describe('pipe()', () => {
    let paramStub;
    let fetchStub;
    let expectedArgs;

    beforeEach(() => {
      expectedArgs = { req: 'foo', res: 'bar', next: () => 'hi' };

      paramStub = sinon.stub(client, 'formatParams')
        .callsFake(() => expectedArgs);

      fetchStub = sinon.stub(client, 'fetch')
        .callsFake(() => Promise.resolve());
    });

    afterEach(() => {
      paramStub.restore();
      fetchStub.restore();
    });

    it('should instantiate', () => {
      expect(client.pipe).to.exist;
      expect(client.pipe).to.be.an.instanceOf(Function);
    });

    it('should call fetch() if valid', () => {
      const validStub = sinon.stub(client, 'isValidRequest')
        .callsFake(() => true);

      const nextStub = sinon.stub(expectedArgs, 'next');

      client.pipe()({}, {}, () => 'hi');

      expect(paramStub.calledOnce).to.be.true;
      expect(validStub.calledOnce).to.be.true;
      expect(fetchStub.calledOnce).to.be.true;
      expect(nextStub.notCalled).to.be.true;

      validStub.restore();
      nextStub.restore();
    });

    it('should call next() if not valid', () => {
      const validStub = sinon.stub(client, 'isValidRequest')
        .callsFake(() => false);

      const nextStub = sinon.spy(expectedArgs, 'next');

      client.pipe()({}, {}, undefined);

      expect(paramStub.calledOnce).to.be.true;
      expect(validStub.calledOnce).to.be.true;
      expect(fetchStub.calledOnce).to.be.false;
      expect(nextStub.calledOnce).to.be.true;

      validStub.restore();
      nextStub.restore();
    });
  });

});
