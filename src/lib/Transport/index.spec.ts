import * as Promise from 'core-js/features/promise';
import * as sinon from 'sinon';
import * as Domo from 'ryuu-client';
import * as MockReq from 'mock-req';
import { IncomingMessage } from 'http';
import { expect } from 'chai';

import { default as Transport } from '.';
import { Manifest } from '../models';

const proxyId = 'textProxyId';

const manifest: Manifest = {
  proxyId,
  id: 'test-id',
  name: 'test-app',
  version: '1.0.0',
  sizing: { width: 1, height: 1 },
};

describe('Transport', () => {
  const lastLogin = 'customer.domo.com';
  const domoDomain = 'https://88e99055-1520-440c-99a0-7b2a27469391.domoapps.test.domo.com';

  let getDomoDomainStub;

  beforeEach((done) => {
    getDomoDomainStub = sinon
      .stub(Transport.prototype, 'getDomoDomain')
      .returns(Promise.resolve(domoDomain));


    done();
  });

  afterEach(() => {
    getDomoDomainStub.restore();
  });

  describe('when creating a new instance', () => {
    let getLastLoginStub;
    let client: Transport;

    beforeEach((done) => {
      getLastLoginStub = sinon
        .stub(Transport.prototype, 'getLastLogin')
        .callsFake(() => {
          const domo = sinon.createStubInstance(Domo);
          domo.instance = 'test.domo.com';
          domo.server = 'http://test.domo.com';

          return Promise.resolve(domo);
        });

      client = new Transport({ manifest });

      done();
    });

    afterEach(() => {
      getLastLoginStub.restore();
    });

    it('should instantiate with no errors', () => {
      expect(Transport).to.exist;
      expect(Transport).to.be.an.instanceof(Function);

      expect(client).to.exist;
      expect(client).to.be.an.instanceof(Transport);
      expect(client.getManifest).to.exist;
    });
  });

  describe('getEnv()', () => {
    let getLastLoginStub;
    let client: Transport;

    beforeEach((done) => {
      getLastLoginStub = sinon
        .stub(Transport.prototype, 'getLastLogin')
        .callsFake(() => {
          const domo = sinon.createStubInstance(Domo);
          domo.instance = 'test.domo.com';
          domo.server = 'http://test.domo.com';

          return Promise.resolve(domo);
        });

      client = new Transport({ manifest });

      done();
    });

    afterEach(() => {
      getLastLoginStub.restore();
    });

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
    let getLastLoginStub;
    let client: Transport;

    beforeEach((done) => {
      getDomoDomainStub.restore();

      getLastLoginStub = sinon
        .stub(Transport.prototype, 'getLastLogin')
        .callsFake(() => {
          const domo = sinon.createStubInstance(Domo);
          domo.instance = 'test.domo.com';
          domo.server = 'http://test.domo.com';
          domo.processRequest
            .returns(Promise.resolve(JSON.stringify({ domoappsDomain: 'domoapps.dev2.domo.com' })));

          return Promise.resolve(domo);
        });

      client = new Transport({ manifest });

      done();
    });

    afterEach(() => {
      getLastLoginStub.restore();
    });

    it('should instantiate', () => {
      expect(client.getDomoDomain).to.exist;
      expect(client.getDomoDomain).to.be.an.instanceOf(Function);
    });

    it('should return promise that resolves URL', (done) => {
      const promise: Promise = client.getDomoDomain();
      expect(promise).to.exist;
      promise.then((res) => {
        const pattern = /^https:\/\/(.*).domoapps.dev2.domo.com/g;
        expect(res).to.exist;
        expect(pattern.test(res)).to.be.true;
        done();
      });
    });

    it('should accept an overridden appContextId', (done) => {
      client = new Transport({ manifest });
      client.getDomoDomain().then((res: string) => {
        const pattern = /^https:\/\/(.*).domoapps.dev2.domo.com/g;
        const matches = pattern.exec(res);
        expect(matches[1]).to.equal(proxyId);
        done();
      });
    });
  });

  describe('createContext()', () => {
    let getLastLoginStub;
    let client: Transport;

    beforeEach((done) => {
      getLastLoginStub = sinon
        .stub(Transport.prototype, 'getLastLogin')
        .callsFake(() => {
          const domo = sinon.createStubInstance(Domo);
          domo.instance = 'test.domo.com';
          domo.server = 'http://test.domo.com';
          domo.processRequest.returns(Promise.resolve({
            0: { id: 'test-context' },
            statusCode: 200,
          }));

          return Promise.resolve(domo);
        });

      client = new Transport({ manifest });

      done();
    });

    afterEach(() => {
      getLastLoginStub.restore();
    });

    it('should POST to /domoapps contexts', (done) => {
      client.createContext().then((res) => {
        console.log('res', res);
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

    let getLastLoginStub;
    let client: Transport;

    beforeEach((done) => {
      getLastLoginStub = sinon
        .stub(Transport.prototype, 'getLastLogin')
        .callsFake(() => {
          const domo = sinon.createStubInstance(Domo);
          domo.instance = 'test.domo.com';
          domo.server = 'http://test.domo.com';

          return Promise.resolve(domo);
        });

      client = new Transport({ manifest });

      contextStub = sinon.stub(client, 'createContext')
        .returns(Promise.resolve({ id: 'fake-context' }));

      done();
    });

    afterEach(() => {
      getLastLoginStub.restore();
      contextStub.restore();
    });

    it('should instantiate', () => {
      expect(client.build).to.exist;
      expect(client.build).to.be.an.instanceOf(Function);
    });

    it('should modify referer', (done) => {
      const req: Partial<IncomingMessage> = {
        url: '/data/v1/valid',
        headers: baseHeaders,
      };

      client.build(req as IncomingMessage).then((options) => {
        expect(options.headers).to.have.property('referer', 'test.test?userId=27&context=fake-context');
        done();
      });
    });

    it('should pass through other headers', (done) => {
      const req: Partial<IncomingMessage> = {
        url: '/data/v1/valid',
        headers: {
          ...baseHeaders,
          'X-Custom-Header': 'hello',
        },
      };

      client.build(req as IncomingMessage).then((options) => {
        expect(options.headers).to.deep.equal({
          accept: 'application/json',
          'X-Custom-Header': 'hello',
          referer: 'test.test?userId=27&context=fake-context',
          host: undefined,
        });
        done();
      });
    });

    it('should build full URL', (done) => {
      const req: Partial<IncomingMessage> = {
        url: '/data/v1/test?fields=field1,field2&avg=field2',
        headers: baseHeaders,
      };

      client.build(req as IncomingMessage).then((options) => {
        expect(options.url).to.equal(`${domoDomain}/data/v1/test?fields=field1,field2&avg=field2`);
        done();
      });
    });

    it('should use original request method', (done) => {
      const req: Partial<IncomingMessage> = {
        url: '/data/v1/valid',
        method: 'it does not matter',
        headers: baseHeaders,
      };

      client.build(req as IncomingMessage).then((options) => {
        expect(options.method).to.equal(req.method);
        done();
      });
    });

    describe('parseBody', () => {
      const jsonBody = JSON.stringify({
        name: 'json',
        message: 'should not get mutated',
      });
      const textBody = 'example,csv,string';
      let req;

      beforeEach(() => {
        req = new MockReq({
          url: '/data/v1/valid',
          method: 'POST',
          headers: baseHeaders,
        });
      });

      describe('with JSON body', () => {
        beforeEach(() => {
          req.headers['Content-Type'] = 'application/json';
        });

        it('should forward original body attribute', (done) => {
          req.body = jsonBody;
          req.end();
          client.build(req).then((options) => {
            expect(options.body).to.deep.equal(jsonBody);
            done();
          });
        });

        it('should forward original payload', (done) => {
          req.write(JSON.parse(jsonBody));
          req.end();
          client.build(req).then((options) => {
            expect(options.body).to.deep.equal(jsonBody);
            done();
          });
        });
      });

      describe('with text body', () => {
        beforeEach(() => {
          req.headers['Content-Type'] = 'text/csv';
        });

        it('should forward original body attribute', (done) => {
          req.body = textBody;
          req.end();
          client.build(req).then((options) => {
            expect(options.body).to.deep.equal(textBody);
            done();
          });
        });

        it('should forward original payload', (done) => {
          req.write(textBody);
          req.end();
          client.build(req).then((options) => {
            expect(options.body).to.deep.equal(textBody);
            done();
          });
        });
      });
    });
  });

  describe('isDomoRequest()', () => {
    let getLastLoginStub;
    let client: Transport;

    beforeEach((done) => {
      getLastLoginStub = sinon
        .stub(Transport.prototype, 'getLastLogin')
        .callsFake(() => {
          const domo = sinon.createStubInstance(Domo);
          domo.instance = 'test.domo.com';
          domo.server = 'http://test.domo.com';

          return Promise.resolve(domo);
        });

      client = new Transport({ manifest });

      done();
    });

    afterEach(() => {
      getLastLoginStub.restore();
    });

    it('should instantiate', () => {
      expect(client.isDomoRequest).to.exist;
      expect(client.isDomoRequest).to.be.an.instanceOf(Function);
    });

    it('should pass /domo requests', () => {
      expect(client.isDomoRequest('/domo/users/v1')).to.be.true;
      expect(client.isDomoRequest('/domo/avatars/v1')).to.be.true;
      expect(client.isDomoRequest('/domo/other/v1')).to.be.true;
    });

    it('should pass /data requests', () => {
      expect(client.isDomoRequest('/data/v1/alias')).to.be.true;
    });

    it('should pass /dql requests', () => {
      expect(client.isDomoRequest('/dql/v1/alias')).to.be.true;
    });

    it('should return false for invalid urls', () => {
      expect(client.isDomoRequest('/bad/url')).to.be.false;
      expect(client.isDomoRequest('/data/alias')).to.be.false;
      expect(client.isDomoRequest('/dql')).to.be.false;
    });
  });
});
