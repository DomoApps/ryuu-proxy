import { describe, it, expect, vi } from 'vitest';
import MockReq from 'mock-req';
import type { IncomingMessage } from 'http';
import type { RyuuClient } from 'ryuu-client';

import { createProxy, getOauthTokens } from './index.js';

function createMockClient(): RyuuClient {
  return {
    instance: 'test.domo.com',
    refreshToken: 'test-token',
    designs: {} as any,
    assets: {} as any,
    apps: {} as any,
    users: {} as any,
    login: vi.fn(),
    request: vi.fn().mockResolvedValue(new Response('ok', { status: 200 })),
  };
}

const manifest = {
  id: 'test-id',
  name: 'test-app',
  version: '1.0.0',
  size: { width: 1, height: 1 },
} as any;

const domainUrl = 'https://test-proxy-id.domoapps.test.domo.com';

describe('createProxy', () => {
  it('should return express, stream, and isDomoRequest', () => {
    const proxy = createProxy({
      client: createMockClient(),
      manifest,
      domainUrl,
    });

    expect(typeof proxy.express).toBe('function');
    expect(typeof proxy.stream).toBe('function');
    expect(typeof proxy.isDomoRequest).toBe('function');
  });

  describe('isDomoRequest', () => {
    const proxy = createProxy({
      client: createMockClient(),
      manifest,
      domainUrl,
    });

    it('should match /domo requests', () => {
      expect(proxy.isDomoRequest('/domo/users/v1')).toBe(true);
      expect(proxy.isDomoRequest('/domo/avatars/v1')).toBe(true);
    });

    it('should match /data requests', () => {
      expect(proxy.isDomoRequest('/data/v1/alias')).toBe(true);
    });

    it('should match /dql requests', () => {
      expect(proxy.isDomoRequest('/dql/v1/alias')).toBe(true);
    });

    it('should match /sql requests', () => {
      expect(proxy.isDomoRequest('/sql/v1/query')).toBe(true);
    });

    it('should match /api requests', () => {
      expect(proxy.isDomoRequest('/api/data/v2/datasources')).toBe(true);
    });

    it('should reject invalid urls', () => {
      expect(proxy.isDomoRequest('/bad/url')).toBe(false);
      expect(proxy.isDomoRequest('/data/alias')).toBe(false);
      expect(proxy.isDomoRequest(undefined)).toBe(false);
    });
  });

  describe('express()', () => {
    it('should return middleware with correct arity', () => {
      const proxy = createProxy({
        client: createMockClient(),
        manifest,
        domainUrl,
      });

      const middleware = proxy.express();
      expect(typeof middleware).toBe('function');
      expect(middleware.length).toBe(3);
    });

    it('should call next() for non-Domo requests', () => {
      const proxy = createProxy({
        client: createMockClient(),
        manifest,
        domainUrl,
      });

      const middleware = proxy.express();
      const req = { url: '/some/other/path', headers: {} } as any;
      const res = {} as any;
      const next = vi.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should proxy Domo requests with correct URL', async () => {
      const mockClient = createMockClient();
      const proxy = createProxy({
        client: mockClient,
        manifest,
        domainUrl,
      });

      const middleware = proxy.express();
      const req = new MockReq({
        url: '/data/v1/test?fields=field1',
        method: 'GET',
        headers: { referer: 'test.test?userId=27', accept: 'application/json' },
      });
      req.end();

      const res = {
        status: vi.fn().mockReturnThis(),
        setHeader: vi.fn(),
        end: vi.fn(),
        send: vi.fn(),
      } as any;
      const next = vi.fn();

      middleware(req as any, res, next);

      // Wait for async proxy
      await new Promise((r) => setTimeout(r, 50));

      expect(mockClient.request).toHaveBeenCalledWith(
        `${domainUrl}/data/v1/test?fields=field1`,
        expect.objectContaining({
          method: 'GET',
          rawResponse: true,
        }),
      );
    });

    it('should preserve referer with query params', async () => {
      const mockClient = createMockClient();
      const proxy = createProxy({
        client: mockClient,
        manifest,
        domainUrl,
      });

      const middleware = proxy.express();
      const req = new MockReq({
        url: '/data/v1/test',
        method: 'GET',
        headers: { referer: 'test.test?userId=27' },
      });
      req.end();

      const res = {
        status: vi.fn().mockReturnThis(),
        setHeader: vi.fn(),
        end: vi.fn(),
        send: vi.fn(),
      } as any;

      middleware(req as any, res, vi.fn());
      await new Promise((r) => setTimeout(r, 50));

      const callHeaders = (mockClient.request as any).mock.calls[0][1].headers;
      expect(callHeaders.referer).toBe('test.test?userId=27');
    });

    it('should add default params to referer without query', async () => {
      const mockClient = createMockClient();
      const proxy = createProxy({
        client: mockClient,
        manifest,
        domainUrl,
      });

      const middleware = proxy.express();
      const req = new MockReq({
        url: '/data/v1/test',
        method: 'GET',
        headers: { referer: 'https://test.domo.com/page' },
      });
      req.end();

      const res = {
        status: vi.fn().mockReturnThis(),
        setHeader: vi.fn(),
        end: vi.fn(),
        send: vi.fn(),
      } as any;

      middleware(req as any, res, vi.fn());
      await new Promise((r) => setTimeout(r, 50));

      const callHeaders = (mockClient.request as any).mock.calls[0][1].headers;
      expect(callHeaders.referer).toContain('userId=27');
      expect(callHeaders.referer).toContain('customer=dev');
    });
  });

  describe('with OAuth tokens', () => {
    it('should inject OAuth cookies', async () => {
      const mockClient = createMockClient();
      const proxy = createProxy({
        client: mockClient,
        manifest,
        domainUrl,
        oauthTokens: { access: 'test-access', refresh: 'test-refresh' },
      });

      const middleware = proxy.express();
      const req = new MockReq({
        url: '/data/v1/test',
        method: 'GET',
        headers: { referer: 'test.test?x=1' },
      });
      req.end();

      const res = {
        status: vi.fn().mockReturnThis(),
        setHeader: vi.fn(),
        end: vi.fn(),
        send: vi.fn(),
      } as any;

      middleware(req as any, res, vi.fn());
      await new Promise((r) => setTimeout(r, 50));

      const callHeaders = (mockClient.request as any).mock.calls[0][1].headers;
      expect(callHeaders.cookie).toContain('_daatv1=test-access');
      expect(callHeaders.cookie).toContain('_dartv1=test-refresh');
    });

    it('should merge existing cookies with OAuth tokens', async () => {
      const mockClient = createMockClient();
      const proxy = createProxy({
        client: mockClient,
        manifest,
        domainUrl,
        oauthTokens: { access: 'test-access', refresh: 'test-refresh' },
      });

      const middleware = proxy.express();
      const req = new MockReq({
        url: '/data/v1/test',
        method: 'GET',
        headers: { referer: 'test.test?x=1', cookie: 'existing=value' },
      });
      req.end();

      const res = {
        status: vi.fn().mockReturnThis(),
        setHeader: vi.fn(),
        end: vi.fn(),
        send: vi.fn(),
      } as any;

      middleware(req as any, res, vi.fn());
      await new Promise((r) => setTimeout(r, 50));

      const callHeaders = (mockClient.request as any).mock.calls[0][1].headers;
      expect(callHeaders.cookie).toContain('existing=value');
      expect(callHeaders.cookie).toContain('_daatv1=test-access');
    });
  });

  describe('stream()', () => {
    it('should return undefined for non-Domo requests', () => {
      const proxy = createProxy({
        client: createMockClient(),
        manifest,
        domainUrl,
      });

      const req = { url: '/other', headers: {} } as IncomingMessage;
      expect(proxy.stream(req)).toBeUndefined();
    });

    it('should return a promise for Domo requests', () => {
      const proxy = createProxy({
        client: createMockClient(),
        manifest,
        domainUrl,
      });

      const req = new MockReq({
        url: '/data/v1/test',
        method: 'GET',
        headers: { referer: 'test?x=1' },
      });
      req.end();

      const result = proxy.stream(req as IncomingMessage);
      expect(result).toBeInstanceOf(Promise);
    });
  });
});

describe('getOauthTokens', () => {
  it('should return undefined when tokens do not exist', () => {
    const result = getOauthTokens('nonexistent.domo.com', 'proxy-id');
    expect(result).toBeUndefined();
  });
});
