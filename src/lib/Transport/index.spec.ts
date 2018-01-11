import * as Promise from 'core-js/es6/promise';
import * as sinon from 'sinon';
import * as nock from 'nock';
import * as Domo from 'ryuu-client';
import * as request from 'request';
import { Request } from 'express';
import { expect } from 'chai';
import { default as Transport } from '.';
import { Manifest, DomoClient } from '../models';

describe('Transport', () => {
  const lastLogin = 'customer.domo.com';
  const domoDomain = 'https://88e99055-1520-440c-99a0-7b2a27469391.domoapps.test.domo.com';

  let client: Transport;
  let manifest: Manifest;
  let clientStub;
  let promiseStub;

  beforeEach((done) => {
    clientStub = sinon
      .stub(Transport.prototype, 'getLastLogin')
      .callsFake(() => {
        const domo = sinon.createStubInstance(Domo);
        domo.getAuthHeader.returns({ 'X-Domo-Authentication': 'stub' });
        domo.instance = 'test.domo.com';
        domo.server = 'http://test.domo.com';

        return domo;
      });

    promiseStub = sinon
      .stub(Transport.prototype, 'getDomoDomain')
      .callsFake(() => Promise.resolve(domoDomain));

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
    expect(client.getManifest).to.exist;
    expect(client.getDomoClient).to.exist;
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
      const env: string = client.getEnv('test.dev.domo.com');
      expect(env).to.equal('dev.domo.com');
    });
  });

  describe('getDomoDomain()', () => {
    beforeEach(() => {
      const OK = 200;
      nock('http://test.domo.com')
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
      nock('http://test.domo.com')
        .post('/domoapps/apps/v2/contexts')
        .reply(OK, [{ id: 'test-context' }]);
    });

    it('should POST to /domoapps contexts', (done) => {
      client.createContext().then((res) => {
        expect(res).to.exist;
        expect(res.id).to.equal('test-context');
        done();
      });
    });
  });

  describe('build()', () => {
    const baseHeaders = {
      referer: 'test.test?userId=27',
      accept: 'application/json',
    };

    let contextStub;

    beforeEach(() => {
      contextStub = sinon.stub(client, 'createContext')
        .returns(Promise.resolve({ id: 'fake-context' }));
    });

    afterEach(() => {
      contextStub.restore();
    });

    it('should instantiate', () => {
      expect(client.build).to.exist;
      expect(client.build).to.be.an.instanceOf(Function);
    });

    it('should modify referer', () => {
      const req: Partial<Request> = {
        url: '/data/v1/valid',
        headers: baseHeaders,
      };

      client.build(req as Request).then((options) => {
        expect(options.headers).to.have.property('Referer', 'test.test?userId=27&context=fake-context');
      });
    });

    it('should add auth header', () => {
      const req: Partial<Request> = {
        url: '/data/v1/valid',
        headers: baseHeaders,
      };

      client.build(req as Request).then((options) => {
        expect(options.headers).to.have.property('X-Domo-Authentication', 'stub');
      });
    });

    it('should add json content-type header if none exist', () => {
      const req: Partial<Request> = {
        url: '/data/v1/valid',
        headers: baseHeaders,
      };

      client.build(req as Request).then((options) => {
        expect(options.headers).to.have.property('Content-Type', 'application/json');
      });
    });

    it('should build full URL', (done) => {
      const req: Partial<Request> = {
        url: '/data/v1/test?fields=field1,field2&avg=field2',
        headers: baseHeaders,
      };

      client.build(req as Request).then((options) => {
        expect(options.url).to.equal(`${domoDomain}/data/v1/test?fields=field1,field2&avg=field2`);
        done();
      });
    });

    it('should use original request method', (done) => {
      const req: Partial<Request> = {
        url: '/data/v1/valid',
        method: 'it does not matter',
        headers: baseHeaders,
      };

      client.build(req as Request).then((options) => {
        expect(options.method).to.equal(req.method);
        done();
      });
    });

    // it('should not munch req body', (done) => {
    //   const req: Partial<Request> = {
    //     url: '/data/v1/valid',
    //     headers: {
    //       ...baseHeaders,
    //       'Content-Type': 'application/json',
    //     },
    //     body: {
    //       name: 'json',
    //       message: 'should not get mutated',
    //     },
    //   };

    //   const stub = sinon.stub();
    //   stub.withArgs('data').returns(req.body);
    //   req.on = stub;

    //   client.build(req as Request).then((options) => {
    //     expect(options.body).to.deep.equal(req.body);
    //     done();
    //   });
    // });
  });

  describe('isValidRequest()', () => {
    it('should instantiate', () => {
      expect(client.isValidRequest).to.exist;
      expect(client.isValidRequest).to.be.an.instanceOf(Function);
    });

    it('should pass /domo requests', () => {
      expect(client.isValidRequest('/domo/users/v1')).to.be.true;
      expect(client.isValidRequest('/domo/avatars/v1')).to.be.true;
      expect(client.isValidRequest('/domo/other/v1')).to.be.true;
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
