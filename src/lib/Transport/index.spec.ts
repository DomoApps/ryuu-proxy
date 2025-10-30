import * as sinon from 'sinon';
// @ts-ignore - mock-req doesn't have types
import MockReq from 'mock-req';
import { IncomingMessage } from 'http';
import { expect } from 'chai';
const Domo: typeof import('ryuu-client') = require('ryuu-client');

import Transport from '.';
import { Manifest } from '../models';

// Mock Domo interface for testing
interface MockDomo {
  getInstance: sinon.SinonStub;
  getDomoappsData: sinon.SinonStub;
  processRequestRaw: sinon.SinonStub;
  [key: string]: any; // Allow additional properties
}

const proxyId = 'textProxyId';

const manifest: Manifest = {
  proxyId,
  id: 'test-id',
  name: 'test-app',
  version: '1.0.0',
  size: { width: 1, height: 1 },
  draft: false,
  publicAssetsEnabled: false,
  flags: new Map<string, boolean>(),
  fullpage: false,
};

describe('Transport', () => {
  const domoDomain = {
    url: 'https://88e99055-1520-440c-99a0-7b2a27469391.domoapps.test.domo.com',
  };

  let getDomainPromiseStub: sinon.SinonStub;

  beforeEach((done) => {
    getDomainPromiseStub = sinon.stub(Transport.prototype, 'getDomainPromise').returns(Promise.resolve(domoDomain));

    done();
  });

  afterEach(() => {
    getDomainPromiseStub.restore();
  });

  describe('when creating a new instance', () => {
    let getLastLoginStub: sinon.SinonStub;
    let client: Transport;

    beforeEach((done) => {
      getLastLoginStub = sinon.stub(Transport.prototype, 'getLastLogin').callsFake(() => {
        const domo = sinon.createStubInstance(Domo) as unknown as MockDomo;
        domo.getInstance.returns('test.domo.com');

        return Promise.resolve(domo as unknown as InstanceType<typeof Domo>);
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
    let getLastLoginStub: sinon.SinonStub;
    let client: Transport;

    beforeEach((done) => {
      getLastLoginStub = sinon.stub(Transport.prototype, 'getLastLogin').callsFake(() => {
        const domo = sinon.createStubInstance(Domo) as unknown as MockDomo;
        domo.getInstance.returns('test.domo.com');

        return Promise.resolve(domo as unknown as InstanceType<typeof Domo>);
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

    it('should throw error for invalid instance format', () => {
      expect(() => client.getEnv('invalid')).to.throw('Invalid instance format');
    });
  });

  describe('getDomainPromise()', () => {
    let getLastLoginStub: sinon.SinonStub;
    let client: Transport;

    beforeEach((done) => {
      getDomainPromiseStub.restore();

      getLastLoginStub = sinon.stub(Transport.prototype, 'getLastLogin').callsFake(() => {
        const domo = sinon.createStubInstance(Domo) as unknown as MockDomo;
        domo.getInstance.returns('test.domo.com');
        domo.getDomoappsData.returns(
          Promise.resolve({
            url: 'https://textProxyId.domoapps.dev2.domo.com',
          } as { url: string })
        );

        return Promise.resolve(domo as unknown as InstanceType<typeof Domo>);
      });

      client = new Transport({ manifest });

      done();
    });

    afterEach(() => {
      getLastLoginStub.restore();
    });

    it('should instantiate', () => {
      expect(client.getDomainPromise).to.exist;
      expect(client.getDomainPromise).to.be.an.instanceOf(Function);
    });

    it('should return promise that resolves domain object', (done) => {
      const promise: Promise<{ url: string }> = client.getDomainPromise();
      expect(promise).to.exist;
      promise.then((res) => {
        expect(res).to.exist;
        expect(res.url).to.exist;
        expect(res.url).to.include('domoapps.dev2.domo.com');
        done();
      });
    });
  });

  describe('build()', () => {
    const baseHeaders = {
      referer: 'test.test?userId=27',
      accept: 'application/json',
    };

    let getLastLoginStub: sinon.SinonStub;
    let getScopedOauthTokensStub: sinon.SinonStub;
    let client: Transport;

    beforeEach((done) => {
      getLastLoginStub = sinon.stub(Transport.prototype, 'getLastLogin').callsFake(() => {
        const domo = sinon.createStubInstance(Domo) as unknown as MockDomo;
        domo.getInstance.returns('test.domo.com');
        domo.getDomoappsData.returns(Promise.resolve(domoDomain));

        return Promise.resolve(domo as unknown as InstanceType<typeof Domo>);
      });

      getScopedOauthTokensStub = sinon
        .stub(Transport.prototype, 'getScopedOauthTokens')
        .returns(Promise.resolve(undefined));

      client = new Transport({ manifest });

      done();
    });

    afterEach(() => {
      getLastLoginStub.restore();
      getScopedOauthTokensStub.restore();
    });

    it('should instantiate', () => {
      expect(client.build).to.exist;
      expect(client.build).to.be.an.instanceOf(Function);
    });

    it('should preserve referer when it has query params', (done) => {
      const req: Partial<IncomingMessage> = {
        url: '/data/v1/valid',
        headers: baseHeaders,
      };

      client
        .build(req as IncomingMessage)
        .then((options) => {
          expect(options.headers).to.have.property('referer');
          expect(options.headers!.referer).to.equal('test.test?userId=27');
          done();
        })
        .catch((err) => {
          done(err);
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
        expect(options.headers!.accept).to.equal('application/json');
        expect(options.headers!['X-Custom-Header']).to.equal('hello');
        expect(options.headers!.referer).to.exist;
        done();
      });
    });

    it('should build full URL', (done) => {
      const req: Partial<IncomingMessage> = {
        url: '/data/v1/test?fields=field1,field2&avg=field2',
        headers: baseHeaders,
      };

      client.build(req as IncomingMessage).then((options) => {
        expect(options.url).to.equal(`${domoDomain.url}/data/v1/test?fields=field1,field2&avg=field2`);
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
      let req: IncomingMessage & { body?: any; write?: (data: any) => void; end?: () => void };

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
          req.end?.();
          client.build(req).then((options) => {
            expect(options.data).to.deep.equal(jsonBody);
            done();
          });
        });

        it('should forward original payload', (done) => {
          req.write?.(JSON.stringify(JSON.parse(jsonBody)));
          req.end?.();
          client.build(req).then((options) => {
            expect(options.data).to.exist;
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
          req.end?.();
          client.build(req).then((options) => {
            expect(options.data).to.deep.equal(textBody);
            done();
          });
        });

        it('should forward original payload', (done) => {
          req.write?.(textBody);
          req.end?.();
          client.build(req).then((options) => {
            expect(options.data).to.deep.equal(textBody);
            done();
          });
        });
      });
    });
  });

  describe('isDomoRequest()', () => {
    let getLastLoginStub: sinon.SinonStub;
    let client: Transport;

    beforeEach((done) => {
      getLastLoginStub = sinon.stub(Transport.prototype, 'getLastLogin').callsFake(() => {
        const domo = sinon.createStubInstance(Domo) as unknown as MockDomo;
        domo.getInstance.returns('test.domo.com');

        return Promise.resolve(domo as unknown as InstanceType<typeof Domo>);
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

    it('should pass /sql requests', () => {
      expect(client.isDomoRequest('/sql/v1/query')).to.be.true;
    });

    it('should pass /api requests', () => {
      expect(client.isDomoRequest('/api/data/v2/datasources')).to.be.true;
    });

    it('should return false for undefined url', () => {
      expect(client.isDomoRequest(undefined)).to.be.false;
    });

    it('should return false for invalid urls', () => {
      expect(client.isDomoRequest('/bad/url')).to.be.false;
      expect(client.isDomoRequest('/data/alias')).to.be.false;
      expect(client.isDomoRequest('/dql')).to.be.false;
    });
  });

  describe('isMultiPartRequest()', () => {
    let getLastLoginStub: sinon.SinonStub;
    let client: Transport;

    beforeEach((done) => {
      getLastLoginStub = sinon.stub(Transport.prototype, 'getLastLogin').callsFake(() => {
        const domo = sinon.createStubInstance(Domo) as unknown as MockDomo;
        domo.getInstance.returns('test.domo.com');

        return Promise.resolve(domo as unknown as InstanceType<typeof Domo>);
      });

      client = new Transport({ manifest });

      done();
    });

    afterEach(() => {
      getLastLoginStub.restore();
    });

    it('should return true for multipart/form-data', () => {
      const headers = { 'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary' };
      expect(client.isMultiPartRequest(headers)).to.be.true;
    });

    it('should return false for other content types', () => {
      const headers = { 'content-type': 'application/json' };
      expect(client.isMultiPartRequest(headers)).to.be.false;
    });

    it('should return false when no content-type header', () => {
      const headers = {};
      expect(client.isMultiPartRequest(headers)).to.be.false;
    });
  });

  describe('build() with OAuth tokens', () => {
    let getLastLoginStub: sinon.SinonStub;
    let getScopedOauthTokensStub: sinon.SinonStub;
    let client: Transport;

    beforeEach((done) => {
      getLastLoginStub = sinon.stub(Transport.prototype, 'getLastLogin').callsFake(() => {
        const domo = sinon.createStubInstance(Domo) as unknown as MockDomo;
        domo.getInstance.returns('test.domo.com');
        domo.getDomoappsData.returns(Promise.resolve(domoDomain));

        return Promise.resolve(domo as unknown as InstanceType<typeof Domo>);
      });

      getScopedOauthTokensStub = sinon.stub(Transport.prototype, 'getScopedOauthTokens').returns(
        Promise.resolve({
          access: 'test-access-token',
          refresh: 'test-refresh-token',
        })
      );

      client = new Transport({ manifest });

      done();
    });

    afterEach(() => {
      getLastLoginStub.restore();
      getScopedOauthTokensStub.restore();
    });

    it('should include OAuth tokens in cookies when available', (done) => {
      const req: Partial<IncomingMessage> = {
        url: '/data/v1/test',
        headers: {
          referer: 'test.test',
          accept: 'application/json',
        },
      };

      client.build(req as IncomingMessage).then((options) => {
        expect(options.headers).to.have.property('cookie');
        expect(options.headers!.cookie).to.include('_daatv1=test-access-token');
        expect(options.headers!.cookie).to.include('_dartv1=test-refresh-token');
        done();
      });
    });
  });

  describe('build() with array cookie header', () => {
    let getLastLoginStub: sinon.SinonStub;
    let getScopedOauthTokensStub: sinon.SinonStub;
    let client: Transport;

    beforeEach((done) => {
      getLastLoginStub = sinon.stub(Transport.prototype, 'getLastLogin').callsFake(() => {
        const domo = sinon.createStubInstance(Domo) as unknown as MockDomo;
        domo.getInstance.returns('test.domo.com');
        domo.getDomoappsData.returns(Promise.resolve(domoDomain));

        return Promise.resolve(domo as unknown as InstanceType<typeof Domo>);
      });

      getScopedOauthTokensStub = sinon
        .stub(Transport.prototype, 'getScopedOauthTokens')
        .returns(Promise.resolve(undefined));

      client = new Transport({ manifest });

      done();
    });

    afterEach(() => {
      getLastLoginStub.restore();
      getScopedOauthTokensStub.restore();
    });

    it('should handle array cookie headers', (done) => {
      const req: Partial<IncomingMessage> = {
        url: '/data/v1/test',
        headers: {
          referer: 'test.test',
          accept: 'application/json',
          cookie: ['cookie1=value1', 'cookie2=value2'] as any,
        },
      };

      client.build(req as IncomingMessage).then((options) => {
        expect(options.headers).to.have.property('cookie');
        expect(options.headers!.cookie).to.include('cookie1=value1');
        expect(options.headers!.cookie).to.include('cookie2=value2');
        done();
      });
    });
  });

  describe('buildBasic()', () => {
    let getLastLoginStub: sinon.SinonStub;
    let getScopedOauthTokensStub: sinon.SinonStub;
    let client: Transport;

    beforeEach((done) => {
      getLastLoginStub = sinon.stub(Transport.prototype, 'getLastLogin').callsFake(() => {
        const domo = sinon.createStubInstance(Domo) as unknown as MockDomo;
        domo.getInstance.returns('test.domo.com');
        domo.getDomoappsData.returns(Promise.resolve(domoDomain));

        return Promise.resolve(domo as unknown as InstanceType<typeof Domo>);
      });

      getScopedOauthTokensStub = sinon
        .stub(Transport.prototype, 'getScopedOauthTokens')
        .returns(Promise.resolve(undefined));

      client = new Transport({ manifest });

      done();
    });

    afterEach(() => {
      getLastLoginStub.restore();
      getScopedOauthTokensStub.restore();
    });

    it('should build basic options without body parsing', (done) => {
      const req: Partial<IncomingMessage> = {
        url: '/data/v1/test',
        method: 'POST',
        headers: {
          referer: 'test.test',
          accept: 'application/json',
          'content-type': 'multipart/form-data',
        },
      };

      client.buildBasic(req as IncomingMessage).then((options) => {
        expect(options.url).to.exist;
        expect(options.method).to.equal('POST');
        expect(options.headers).to.exist;
        expect(options.headers).to.not.have.property('content-type');
        expect(options.headers).to.not.have.property('content-length');
        done();
      });
    });
  });

  describe('request()', () => {
    let getLastLoginStub: sinon.SinonStub;
    let client: Transport;

    beforeEach((done) => {
      getLastLoginStub = sinon.stub(Transport.prototype, 'getLastLogin').callsFake(() => {
        const domo = sinon.createStubInstance(Domo) as unknown as MockDomo;
        domo.getInstance.returns('test.domo.com');

        return Promise.resolve(domo as unknown as InstanceType<typeof Domo>);
      });

      client = new Transport({ manifest });

      done();
    });

    afterEach(() => {
      getLastLoginStub.restore();
    });

    it('should exist and be a function', () => {
      expect(client.request).to.exist;
      expect(client.request).to.be.an.instanceOf(Function);
    });
  });

  describe('getManifest()', () => {
    let getLastLoginStub: sinon.SinonStub;
    let client: Transport;

    beforeEach((done) => {
      getLastLoginStub = sinon.stub(Transport.prototype, 'getLastLogin').callsFake(() => {
        const domo = sinon.createStubInstance(Domo) as unknown as MockDomo;
        domo.getInstance.returns('test.domo.com');

        return Promise.resolve(domo as unknown as InstanceType<typeof Domo>);
      });

      client = new Transport({ manifest });

      done();
    });

    afterEach(() => {
      getLastLoginStub.restore();
    });

    it('should return the manifest', () => {
      const result = client.getManifest();
      expect(result).to.deep.equal(manifest);
    });
  });

  describe('build() with existing cookie and OAuth tokens', () => {
    let getLastLoginStub: sinon.SinonStub;
    let getScopedOauthTokensStub: sinon.SinonStub;
    let client: Transport;

    beforeEach((done) => {
      getLastLoginStub = sinon.stub(Transport.prototype, 'getLastLogin').callsFake(() => {
        const domo = sinon.createStubInstance(Domo) as unknown as MockDomo;
        domo.getInstance.returns('test.domo.com');
        domo.getDomoappsData.returns(Promise.resolve(domoDomain));

        return Promise.resolve(domo as unknown as InstanceType<typeof Domo>);
      });

      getScopedOauthTokensStub = sinon.stub(Transport.prototype, 'getScopedOauthTokens').returns(
        Promise.resolve({
          access: 'test-access-token',
          refresh: 'test-refresh-token',
        })
      );

      client = new Transport({ manifest });

      done();
    });

    afterEach(() => {
      getLastLoginStub.restore();
      getScopedOauthTokensStub.restore();
    });

    it('should merge existing cookies with OAuth tokens', (done) => {
      const req: Partial<IncomingMessage> = {
        url: '/data/v1/test',
        headers: {
          referer: 'test.test',
          accept: 'application/json',
          cookie: 'existingCookie=value1',
        },
      };

      client.build(req as IncomingMessage).then((options) => {
        expect(options.headers).to.have.property('cookie');
        expect(options.headers!.cookie).to.include('existingCookie=value1');
        expect(options.headers!.cookie).to.include('_daatv1=test-access-token');
        expect(options.headers!.cookie).to.include('_dartv1=test-refresh-token');
        done();
      });
    });
  });

  describe('build() with only existing cookie (no OAuth)', () => {
    let getLastLoginStub: sinon.SinonStub;
    let getScopedOauthTokensStub: sinon.SinonStub;
    let client: Transport;

    beforeEach((done) => {
      getLastLoginStub = sinon.stub(Transport.prototype, 'getLastLogin').callsFake(() => {
        const domo = sinon.createStubInstance(Domo) as unknown as MockDomo;
        domo.getInstance.returns('test.domo.com');
        domo.getDomoappsData.returns(Promise.resolve(domoDomain));

        return Promise.resolve(domo as unknown as InstanceType<typeof Domo>);
      });

      getScopedOauthTokensStub = sinon
        .stub(Transport.prototype, 'getScopedOauthTokens')
        .returns(Promise.resolve(undefined));

      client = new Transport({ manifest });

      done();
    });

    afterEach(() => {
      getLastLoginStub.restore();
      getScopedOauthTokensStub.restore();
    });

    it('should keep existing cookie when no OAuth tokens', (done) => {
      const req: Partial<IncomingMessage> = {
        url: '/data/v1/test',
        headers: {
          referer: 'test.test',
          accept: 'application/json',
          cookie: 'existingCookie=value1',
        },
      };

      client.build(req as IncomingMessage).then((options) => {
        expect(options.headers).to.have.property('cookie');
        expect(options.headers!.cookie).to.equal('existingCookie=value1');
        done();
      });
    });
  });

  describe('build() with multipart content type', () => {
    let getLastLoginStub: sinon.SinonStub;
    let getScopedOauthTokensStub: sinon.SinonStub;
    let client: Transport;

    beforeEach((done) => {
      getLastLoginStub = sinon.stub(Transport.prototype, 'getLastLogin').callsFake(() => {
        const domo = sinon.createStubInstance(Domo) as unknown as MockDomo;
        domo.getInstance.returns('test.domo.com');
        domo.getDomoappsData.returns(Promise.resolve(domoDomain));

        return Promise.resolve(domo as unknown as InstanceType<typeof Domo>);
      });

      getScopedOauthTokensStub = sinon
        .stub(Transport.prototype, 'getScopedOauthTokens')
        .returns(Promise.resolve(undefined));

      client = new Transport({ manifest });

      done();
    });

    afterEach(() => {
      getLastLoginStub.restore();
      getScopedOauthTokensStub.restore();
    });

    it('should filter multipart headers correctly', (done) => {
      const req: Partial<IncomingMessage> = {
        url: '/data/v1/test',
        method: 'POST',
        headers: {
          referer: 'test.test',
          accept: 'application/json',
          'content-type': 'multipart/form-data',
          'content-length': '1234',
        },
      };

      client.build(req as IncomingMessage).then((options) => {
        expect(options.headers).to.exist;
        expect(options.headers).to.not.have.property('content-type');
        expect(options.headers).to.not.have.property('content-length');
        expect(options.headers).to.have.property('accept');
        done();
      });
    });
  });

  describe('build() with referer without query params', () => {
    let getLastLoginStub: sinon.SinonStub;
    let getScopedOauthTokensStub: sinon.SinonStub;
    let client: Transport;

    beforeEach((done) => {
      getLastLoginStub = sinon.stub(Transport.prototype, 'getLastLogin').callsFake(() => {
        const domo = sinon.createStubInstance(Domo) as unknown as MockDomo;
        domo.getInstance.returns('test.domo.com');
        domo.getDomoappsData.returns(Promise.resolve(domoDomain));

        return Promise.resolve(domo as unknown as InstanceType<typeof Domo>);
      });

      getScopedOauthTokensStub = sinon
        .stub(Transport.prototype, 'getScopedOauthTokens')
        .returns(Promise.resolve(undefined));

      client = new Transport({ manifest });

      done();
    });

    afterEach(() => {
      getLastLoginStub.restore();
      getScopedOauthTokensStub.restore();
    });

    it('should add default query params to referer when missing', (done) => {
      const req: Partial<IncomingMessage> = {
        url: '/data/v1/test',
        headers: {
          referer: 'https://test.domo.com/page',
          accept: 'application/json',
        },
      };

      client.build(req as IncomingMessage).then((options) => {
        expect(options.headers).to.have.property('referer');
        expect(options.headers!.referer).to.include('userId=27');
        expect(options.headers!.referer).to.include('customer=dev');
        expect(options.headers!.referer).to.include('locale=en-US');
        done();
      });
    });
  });

  describe('authentication error handling', () => {
    let getLastLoginStub: sinon.SinonStub;
    let getDomainPromiseStubLocal: sinon.SinonStub;

    beforeEach(() => {
      getDomainPromiseStubLocal = getDomainPromiseStub;
      getDomainPromiseStubLocal.restore();
    });

    afterEach(() => {
      if (getLastLoginStub) getLastLoginStub.restore();
    });

    it('should handle authentication errors gracefully when not authenticated', (done) => {
      // Simulate getMostRecentLogin returning an empty object (no authentication)
      getLastLoginStub = sinon.stub(Transport.prototype, 'getLastLogin').callsFake(() => {
        // This simulates what happens when verifyLogin throws an error
        return Promise.reject(new Error('Not authenticated. Please login using "domo login"'));
      });

      try {
        const client = new Transport({ manifest });

        // Try to build a request - this should trigger the authentication error
        const req: Partial<IncomingMessage> = {
          url: '/data/v1/test',
          headers: {
            referer: 'test.test',
            accept: 'application/json',
          },
        };

        client
          .build(req as IncomingMessage)
          .then(() => {
            done(new Error('Should have thrown an authentication error'));
          })
          .catch((err) => {
            expect(err).to.exist;
            expect(err.message).to.include('Not authenticated');
            done();
          });
      } catch (err: any) {
        // If we catch an error here, it means unhandled promise rejection occurred
        expect.fail('Unhandled promise rejection occurred during Transport construction');
      }
    });

    it('should reject clientPromise when not authenticated', (done) => {
      getLastLoginStub = sinon.stub(Transport.prototype, 'getLastLogin').callsFake(() => {
        return Promise.reject(new Error('Not authenticated. Please login using "domo login"'));
      });

      const client = new Transport({ manifest });

      // Access the clientPromise directly to verify it rejects properly
      client['clientPromise']
        .then(() => {
          done(new Error('clientPromise should have been rejected'));
        })
        .catch((err) => {
          expect(err).to.exist;
          expect(err.message).to.include('Not authenticated');
          done();
        });
    });

    it('should reject domainPromise when authentication fails', (done) => {
      getLastLoginStub = sinon.stub(Transport.prototype, 'getLastLogin').callsFake(() => {
        return Promise.reject(new Error('Not authenticated. Please login using "domo login"'));
      });

      const client = new Transport({ manifest });

      // The domainPromise depends on clientPromise, so it should also reject
      client
        .getDomainPromise()
        .then(() => {
          done(new Error('domainPromise should have been rejected'));
        })
        .catch((err) => {
          expect(err).to.exist;
          expect(err.message).to.include('Not authenticated');
          done();
        });
    });
  });
});
