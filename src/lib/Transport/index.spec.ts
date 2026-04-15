import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MockReq from 'mock-req';
import { IncomingMessage } from 'http';

import Transport from './index.js';
import type { Manifest } from '../models.js';
import type { RyuuClient } from 'ryuu-client';

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

function createMockClient(): RyuuClient {
  return {
    instance: 'test.domo.com',
    refreshToken: 'test-token',
    designs: {} as any,
    assets: {} as any,
    apps: {
      createInstance: vi.fn(),
      getEnvironment: vi.fn().mockResolvedValue({
        url: 'https://textProxyId.domoapps.dev2.domo.com',
      }),
    } as any,
    users: {} as any,
    login: vi.fn(),
    request: vi.fn(),
  };
}

describe('Transport', () => {
  const domoDomain = {
    url: 'https://88e99055-1520-440c-99a0-7b2a27469391.domoapps.test.domo.com',
  };

  let getDomainPromiseStub: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getDomainPromiseStub = vi.spyOn(Transport.prototype, 'getDomainPromise').mockReturnValue(Promise.resolve(domoDomain));
  });

  afterEach(() => {
    getDomainPromiseStub.mockRestore();
  });

  describe('when creating a new instance', () => {
    let getLastLoginStub: ReturnType<typeof vi.spyOn>;
    let client: Transport;

    beforeEach(() => {
      getLastLoginStub = vi.spyOn(Transport.prototype, 'getLastLogin').mockReturnValue(
        Promise.resolve(createMockClient())
      );

      client = new Transport({ manifest });
    });

    afterEach(() => {
      getLastLoginStub.mockRestore();
    });

    it('should instantiate with no errors', () => {
      expect(Transport).toBeDefined();
      expect(typeof Transport).toBe('function');
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(Transport);
      expect(client.getManifest).toBeDefined();
    });
  });

  describe('getEnv()', () => {
    let getLastLoginStub: ReturnType<typeof vi.spyOn>;
    let client: Transport;

    beforeEach(() => {
      getLastLoginStub = vi.spyOn(Transport.prototype, 'getLastLogin').mockReturnValue(
        Promise.resolve(createMockClient())
      );
      client = new Transport({ manifest });
    });

    afterEach(() => {
      getLastLoginStub.mockRestore();
    });

    it('should return env from instance string', () => {
      const env = client.getEnv('test.dev.domo.com');
      expect(env).toBe('dev.domo.com');
    });

    it('should throw error for invalid instance format', () => {
      expect(() => client.getEnv('invalid')).toThrow('Invalid instance format');
    });
  });

  describe('getDomainPromise()', () => {
    let getLastLoginStub: ReturnType<typeof vi.spyOn>;
    let client: Transport;

    beforeEach(() => {
      getDomainPromiseStub.mockRestore();

      getLastLoginStub = vi.spyOn(Transport.prototype, 'getLastLogin').mockReturnValue(
        Promise.resolve(createMockClient())
      );

      client = new Transport({ manifest });
    });

    afterEach(() => {
      getLastLoginStub.mockRestore();
      // Re-establish the domain stub for subsequent test groups
      getDomainPromiseStub = vi.spyOn(Transport.prototype, 'getDomainPromise').mockReturnValue(Promise.resolve(domoDomain));
    });

    it('should return promise that resolves domain object', async () => {
      const res = await client.getDomainPromise();
      expect(res).toBeDefined();
      expect(res.url).toBeDefined();
      expect(res.url).toContain('domoapps');
    });
  });

  describe('build()', () => {
    const baseHeaders = {
      referer: 'test.test?userId=27',
      accept: 'application/json',
    };

    let getLastLoginStub: ReturnType<typeof vi.spyOn>;
    let getScopedOauthTokensStub: ReturnType<typeof vi.spyOn>;
    let client: Transport;

    beforeEach(() => {
      getLastLoginStub = vi.spyOn(Transport.prototype, 'getLastLogin').mockReturnValue(
        Promise.resolve(createMockClient())
      );

      getScopedOauthTokensStub = vi.spyOn(Transport.prototype, 'getScopedOauthTokens').mockReturnValue(
        Promise.resolve(undefined)
      );

      client = new Transport({ manifest });
    });

    afterEach(() => {
      getLastLoginStub.mockRestore();
      getScopedOauthTokensStub.mockRestore();
    });

    it('should preserve referer when it has query params', async () => {
      const req: Partial<IncomingMessage> = {
        url: '/data/v1/valid',
        headers: baseHeaders,
      };

      const options = await client.build(req as IncomingMessage);
      expect(options.headers).toHaveProperty('referer');
      expect(options.headers.referer).toBe('test.test?userId=27');
    });

    it('should pass through other headers', async () => {
      const req: Partial<IncomingMessage> = {
        url: '/data/v1/valid',
        headers: {
          ...baseHeaders,
          'X-Custom-Header': 'hello',
        },
      };

      const options = await client.build(req as IncomingMessage);
      expect(options.headers.accept).toBe('application/json');
      expect(options.headers['X-Custom-Header']).toBe('hello');
      expect(options.headers.referer).toBeDefined();
    });

    it('should build full URL', async () => {
      const req: Partial<IncomingMessage> = {
        url: '/data/v1/test?fields=field1,field2&avg=field2',
        headers: baseHeaders,
      };

      const options = await client.build(req as IncomingMessage);
      // URL comes from the mock client's getEnvironment response
      expect(options.url).toContain('/data/v1/test?fields=field1,field2&avg=field2');
      expect(options.url).toContain('domoapps');
    });

    it('should use original request method', async () => {
      const req: Partial<IncomingMessage> = {
        url: '/data/v1/valid',
        method: 'it does not matter',
        headers: baseHeaders,
      };

      const options = await client.build(req as IncomingMessage);
      expect(options.method).toBe(req.method);
    });

    describe('parseBody', () => {
      const jsonBody = JSON.stringify({
        name: 'json',
        message: 'should not get mutated',
      });
      const textBody = 'example,csv,string';

      it('should forward original body attribute', async () => {
        const req = new MockReq({
          url: '/data/v1/valid',
          method: 'POST',
          headers: { ...baseHeaders, 'Content-Type': 'application/json' },
        });
        req.body = jsonBody;
        req.end();

        const options = await client.build(req);
        expect(options.body).toEqual(jsonBody);
      });

      it('should forward original payload', async () => {
        const req = new MockReq({
          url: '/data/v1/valid',
          method: 'POST',
          headers: { ...baseHeaders, 'Content-Type': 'application/json' },
        });
        req.write(JSON.stringify(JSON.parse(jsonBody)));
        req.end();

        const options = await client.build(req);
        expect(options.body).toBeDefined();
      });

      it('should forward text body attribute', async () => {
        const req = new MockReq({
          url: '/data/v1/valid',
          method: 'POST',
          headers: { ...baseHeaders, 'Content-Type': 'text/csv' },
        });
        req.body = textBody;
        req.end();

        const options = await client.build(req);
        expect(options.body).toEqual(textBody);
      });

      it('should forward text payload', async () => {
        const req = new MockReq({
          url: '/data/v1/valid',
          method: 'POST',
          headers: { ...baseHeaders, 'Content-Type': 'text/csv' },
        });
        req.write(textBody);
        req.end();

        const options = await client.build(req);
        expect(options.body).toEqual(textBody);
      });
    });
  });

  describe('isDomoRequest()', () => {
    let getLastLoginStub: ReturnType<typeof vi.spyOn>;
    let client: Transport;

    beforeEach(() => {
      getLastLoginStub = vi.spyOn(Transport.prototype, 'getLastLogin').mockReturnValue(
        Promise.resolve(createMockClient())
      );
      client = new Transport({ manifest });
    });

    afterEach(() => {
      getLastLoginStub.mockRestore();
    });

    it('should pass /domo requests', () => {
      expect(client.isDomoRequest('/domo/users/v1')).toBe(true);
      expect(client.isDomoRequest('/domo/avatars/v1')).toBe(true);
      expect(client.isDomoRequest('/domo/other/v1')).toBe(true);
    });

    it('should pass /data requests', () => {
      expect(client.isDomoRequest('/data/v1/alias')).toBe(true);
    });

    it('should pass /dql requests', () => {
      expect(client.isDomoRequest('/dql/v1/alias')).toBe(true);
    });

    it('should pass /sql requests', () => {
      expect(client.isDomoRequest('/sql/v1/query')).toBe(true);
    });

    it('should pass /api requests', () => {
      expect(client.isDomoRequest('/api/data/v2/datasources')).toBe(true);
    });

    it('should return false for undefined url', () => {
      expect(client.isDomoRequest(undefined)).toBe(false);
    });

    it('should return false for invalid urls', () => {
      expect(client.isDomoRequest('/bad/url')).toBe(false);
      expect(client.isDomoRequest('/data/alias')).toBe(false);
      expect(client.isDomoRequest('/dql')).toBe(false);
    });
  });

  describe('isMultiPartRequest()', () => {
    let getLastLoginStub: ReturnType<typeof vi.spyOn>;
    let client: Transport;

    beforeEach(() => {
      getLastLoginStub = vi.spyOn(Transport.prototype, 'getLastLogin').mockReturnValue(
        Promise.resolve(createMockClient())
      );
      client = new Transport({ manifest });
    });

    afterEach(() => {
      getLastLoginStub.mockRestore();
    });

    it('should return true for multipart/form-data', () => {
      const headers = { 'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary' };
      expect(client.isMultiPartRequest(headers)).toBe(true);
    });

    it('should return false for other content types', () => {
      const headers = { 'content-type': 'application/json' };
      expect(client.isMultiPartRequest(headers)).toBe(false);
    });

    it('should return false when no content-type header', () => {
      const headers = {};
      expect(client.isMultiPartRequest(headers)).toBe(false);
    });
  });

  describe('build() with OAuth tokens', () => {
    let getLastLoginStub: ReturnType<typeof vi.spyOn>;
    let getScopedOauthTokensStub: ReturnType<typeof vi.spyOn>;
    let client: Transport;

    beforeEach(() => {
      getLastLoginStub = vi.spyOn(Transport.prototype, 'getLastLogin').mockReturnValue(
        Promise.resolve(createMockClient())
      );

      getScopedOauthTokensStub = vi.spyOn(Transport.prototype, 'getScopedOauthTokens').mockReturnValue(
        Promise.resolve({
          access: 'test-access-token',
          refresh: 'test-refresh-token',
        })
      );

      client = new Transport({ manifest });
    });

    afterEach(() => {
      getLastLoginStub.mockRestore();
      getScopedOauthTokensStub.mockRestore();
    });

    it('should include OAuth tokens in cookies when available', async () => {
      const req: Partial<IncomingMessage> = {
        url: '/data/v1/test',
        headers: {
          referer: 'test.test',
          accept: 'application/json',
        },
      };

      const options = await client.build(req as IncomingMessage);
      expect(options.headers).toHaveProperty('cookie');
      expect(options.headers.cookie).toContain('_daatv1=test-access-token');
      expect(options.headers.cookie).toContain('_dartv1=test-refresh-token');
    });
  });

  describe('build() with array cookie header', () => {
    let getLastLoginStub: ReturnType<typeof vi.spyOn>;
    let getScopedOauthTokensStub: ReturnType<typeof vi.spyOn>;
    let client: Transport;

    beforeEach(() => {
      getLastLoginStub = vi.spyOn(Transport.prototype, 'getLastLogin').mockReturnValue(
        Promise.resolve(createMockClient())
      );

      getScopedOauthTokensStub = vi.spyOn(Transport.prototype, 'getScopedOauthTokens').mockReturnValue(
        Promise.resolve(undefined)
      );

      client = new Transport({ manifest });
    });

    afterEach(() => {
      getLastLoginStub.mockRestore();
      getScopedOauthTokensStub.mockRestore();
    });

    it('should handle array cookie headers', async () => {
      const req: Partial<IncomingMessage> = {
        url: '/data/v1/test',
        headers: {
          referer: 'test.test',
          accept: 'application/json',
          cookie: ['cookie1=value1', 'cookie2=value2'] as any,
        },
      };

      const options = await client.build(req as IncomingMessage);
      expect(options.headers).toHaveProperty('cookie');
      expect(options.headers.cookie).toContain('cookie1=value1');
      expect(options.headers.cookie).toContain('cookie2=value2');
    });
  });

  describe('build() with existing cookie and OAuth tokens', () => {
    let getLastLoginStub: ReturnType<typeof vi.spyOn>;
    let getScopedOauthTokensStub: ReturnType<typeof vi.spyOn>;
    let client: Transport;

    beforeEach(() => {
      getLastLoginStub = vi.spyOn(Transport.prototype, 'getLastLogin').mockReturnValue(
        Promise.resolve(createMockClient())
      );

      getScopedOauthTokensStub = vi.spyOn(Transport.prototype, 'getScopedOauthTokens').mockReturnValue(
        Promise.resolve({
          access: 'test-access-token',
          refresh: 'test-refresh-token',
        })
      );

      client = new Transport({ manifest });
    });

    afterEach(() => {
      getLastLoginStub.mockRestore();
      getScopedOauthTokensStub.mockRestore();
    });

    it('should merge existing cookies with OAuth tokens', async () => {
      const req: Partial<IncomingMessage> = {
        url: '/data/v1/test',
        headers: {
          referer: 'test.test',
          accept: 'application/json',
          cookie: 'existingCookie=value1',
        },
      };

      const options = await client.build(req as IncomingMessage);
      expect(options.headers).toHaveProperty('cookie');
      expect(options.headers.cookie).toContain('existingCookie=value1');
      expect(options.headers.cookie).toContain('_daatv1=test-access-token');
      expect(options.headers.cookie).toContain('_dartv1=test-refresh-token');
    });
  });

  describe('build() with only existing cookie (no OAuth)', () => {
    let getLastLoginStub: ReturnType<typeof vi.spyOn>;
    let getScopedOauthTokensStub: ReturnType<typeof vi.spyOn>;
    let client: Transport;

    beforeEach(() => {
      getLastLoginStub = vi.spyOn(Transport.prototype, 'getLastLogin').mockReturnValue(
        Promise.resolve(createMockClient())
      );

      getScopedOauthTokensStub = vi.spyOn(Transport.prototype, 'getScopedOauthTokens').mockReturnValue(
        Promise.resolve(undefined)
      );

      client = new Transport({ manifest });
    });

    afterEach(() => {
      getLastLoginStub.mockRestore();
      getScopedOauthTokensStub.mockRestore();
    });

    it('should keep existing cookie when no OAuth tokens', async () => {
      const req: Partial<IncomingMessage> = {
        url: '/data/v1/test',
        headers: {
          referer: 'test.test',
          accept: 'application/json',
          cookie: 'existingCookie=value1',
        },
      };

      const options = await client.build(req as IncomingMessage);
      expect(options.headers).toHaveProperty('cookie');
      expect(options.headers.cookie).toBe('existingCookie=value1');
    });
  });

  describe('build() with multipart content type', () => {
    let getLastLoginStub: ReturnType<typeof vi.spyOn>;
    let getScopedOauthTokensStub: ReturnType<typeof vi.spyOn>;
    let client: Transport;

    beforeEach(() => {
      getLastLoginStub = vi.spyOn(Transport.prototype, 'getLastLogin').mockReturnValue(
        Promise.resolve(createMockClient())
      );

      getScopedOauthTokensStub = vi.spyOn(Transport.prototype, 'getScopedOauthTokens').mockReturnValue(
        Promise.resolve(undefined)
      );

      client = new Transport({ manifest });
    });

    afterEach(() => {
      getLastLoginStub.mockRestore();
      getScopedOauthTokensStub.mockRestore();
    });

    it('should filter multipart headers correctly', async () => {
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

      const options = await client.buildBasic(req as IncomingMessage);
      expect(options.headers).toBeDefined();
      expect(options.headers).not.toHaveProperty('content-type');
      expect(options.headers).not.toHaveProperty('content-length');
      expect(options.headers).toHaveProperty('accept');
    });
  });

  describe('build() with referer without query params', () => {
    let getLastLoginStub: ReturnType<typeof vi.spyOn>;
    let getScopedOauthTokensStub: ReturnType<typeof vi.spyOn>;
    let client: Transport;

    beforeEach(() => {
      getLastLoginStub = vi.spyOn(Transport.prototype, 'getLastLogin').mockReturnValue(
        Promise.resolve(createMockClient())
      );

      getScopedOauthTokensStub = vi.spyOn(Transport.prototype, 'getScopedOauthTokens').mockReturnValue(
        Promise.resolve(undefined)
      );

      client = new Transport({ manifest });
    });

    afterEach(() => {
      getLastLoginStub.mockRestore();
      getScopedOauthTokensStub.mockRestore();
    });

    it('should add default query params to referer when missing', async () => {
      const req: Partial<IncomingMessage> = {
        url: '/data/v1/test',
        headers: {
          referer: 'https://test.domo.com/page',
          accept: 'application/json',
        },
      };

      const options = await client.build(req as IncomingMessage);
      expect(options.headers).toHaveProperty('referer');
      expect(options.headers.referer).toContain('userId=27');
      expect(options.headers.referer).toContain('customer=dev');
      expect(options.headers.referer).toContain('locale=en-US');
    });
  });

  describe('authentication error handling', () => {
    it('should handle authentication errors gracefully when not authenticated', async () => {
      getDomainPromiseStub.mockRestore();

      const getLastLoginStub = vi.spyOn(Transport.prototype, 'getLastLogin').mockReturnValue(
        Promise.reject(new Error('Not authenticated. Please login using "domo login"'))
      );

      const client = new Transport({ manifest });

      const req: Partial<IncomingMessage> = {
        url: '/data/v1/test',
        headers: {
          referer: 'test.test',
          accept: 'application/json',
        },
      };

      await expect(client.build(req as IncomingMessage)).rejects.toThrow('Not authenticated');

      getLastLoginStub.mockRestore();
    });
  });

  describe('getManifest()', () => {
    let getLastLoginStub: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      getLastLoginStub = vi.spyOn(Transport.prototype, 'getLastLogin').mockReturnValue(
        Promise.resolve(createMockClient())
      );
    });

    afterEach(() => {
      getLastLoginStub.mockRestore();
    });

    it('should return the manifest', () => {
      const client = new Transport({ manifest });
      const result = client.getManifest();
      expect(result).toEqual(manifest);
    });
  });

  describe('request()', () => {
    let getLastLoginStub: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      getLastLoginStub = vi.spyOn(Transport.prototype, 'getLastLogin').mockReturnValue(
        Promise.resolve(createMockClient())
      );
    });

    afterEach(() => {
      getLastLoginStub.mockRestore();
    });

    it('should exist and be a function', () => {
      const client = new Transport({ manifest });
      expect(client.request).toBeDefined();
      expect(typeof client.request).toBe('function');
    });
  });
});
