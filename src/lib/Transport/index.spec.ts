import * as Promise from 'core-js/es6/promise';
import * as sinon from 'sinon';
import * as nock from 'nock';
import * as Domo from 'ryuu-client';
import * as request from 'request';
import { expect } from 'chai';
import Transport from '.';
import { Manifest, DomoClient } from '../models';

describe('Transport', () => {
  let client: Transport;
  let manifest: Manifest;
  let clientStub;
  let promiseStub;

  beforeEach((done) => {
    // stub constructor dependencies
    clientStub = sinon.stub(Transport.prototype, 'getLastLogin')
      .callsFake(() => new Domo('test.dev.domo.com', 'test-sid', 'test-token'));

    promiseStub = sinon.stub(Transport.prototype, 'getDomoDomain')
      .callsFake(() => Promise.resolve('https://88e99055-1520-440c-99a0-7b2a27469391.domoapps.dev.domo.com'));

    manifest = {
      id: 'test-id',
      name: 'test-app',
      version: '1.0.0',
      sizing: { width: 1, height: 1 },
    };

    client = new Transport(manifest);
    done();
  });

  afterEach(() => {
    clientStub.restore();
    promiseStub.restore();
  });

  it('should instantiate', () => {
    expect(Transport).to.exist;
    expect(Transport).to.be.an.instanceof(Function);

    expect(client).to.exist;
    expect(client).to.be.an.instanceof(Transport);
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
      nock(client.getDomoClient().server).post('/domoapps/apps/v2/contexts').reply(OK, [{ id: 'test-context' }]);
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

    it('should pass /domo requests', () => {
      expect(client.isValidRequest('/domo/users/v1')).to.be.true;
      expect(client.isValidRequest('/domo/avatars/v1')).to.be.true;
    });

    it('should pass /data requests', () => {
      expect(client.isValidRequest('/data/v1/alias')).to.be.true;
    });

    it('should pass /dql requests', () => {
      expect(client.isValidRequest('/dql/v1/alias')).to.be.true;
    });

    it('should return false for invalid urls', () => {
      expect(client.isValidRequest('/bad/url')).to.be.false;
      expect(client.isValidRequest('/data/alias')).to.be.false;
      expect(client.isValidRequest('/dql')).to.be.false;
    });
  });
});
