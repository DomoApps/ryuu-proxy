import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import MockReq from 'mock-req';
import type { IncomingMessage } from 'http';
import type { RyuuClient } from 'ryuu-client';

import datasetReadinessManifest from './test-fixtures/dataset-readiness-manifest.json' with { type: 'json' };

const ryuuClientMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getHomeDir: vi.fn(() => '/nonexistent'),
}));

vi.mock('ryuu-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ryuu-client')>()),
  createClient: ryuuClientMocks.createClient,
  getHomeDir: ryuuClientMocks.getHomeDir,
}));

import { Proxy, createProxy, getOauthTokens } from './index.js';

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
        })
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

describe('Proxy backwards compatibility', () => {
  const realManifest = datasetReadinessManifest;
  const proxyEnvKeys = [
    'PROXY_HOST',
    'PROXY_PORT',
    'PROXY_USERNAME',
    'PROXY_PASSWORD',
    'REACT_APP_PROXY_HOST',
    'REACT_APP_PROXY_PORT',
    'REACT_APP_PROXY_USERNAME',
    'REACT_APP_PROXY_PASSWORD',
  ] as const;
  const originalProxyEnv = new Map(proxyEnvKeys.map((key) => [key, process.env[key]]));
  let configHome: string;

  function writeLogin(
    login: Record<string, unknown> = {
      instance: 'test.domo.com',
      refreshToken: 'test-refresh-token',
      devToken: false,
    }
  ) {
    const loginDir = join(configHome, 'ryuu');
    mkdirSync(loginDir, { recursive: true });
    writeFileSync(join(loginDir, `${login.instance}.json`), JSON.stringify(login));
  }

  function createLegacyMockClient(): RyuuClient {
    return {
      ...createMockClient(),
      apps: {
        getEnvironment: vi.fn().mockResolvedValue({ url: domainUrl }),
      } as any,
    };
  }

  beforeEach(() => {
    configHome = mkdtempSync(join(tmpdir(), 'ryuu-proxy-test-'));
    ryuuClientMocks.createClient.mockReset();
    ryuuClientMocks.getHomeDir.mockReset().mockReturnValue(configHome);
    proxyEnvKeys.forEach((key) => delete process.env[key]);
  });

  afterEach(() => {
    rmSync(configHome, { recursive: true, force: true });
    proxyEnvKeys.forEach((key) => {
      const original = originalProxyEnv.get(key);
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    });
  });

  it('exports the v5.0 Proxy constructor and proxies with a real app manifest', async () => {
    writeLogin();
    const client = createLegacyMockClient();
    ryuuClientMocks.createClient.mockReturnValue(client);

    const proxy = new Proxy({ manifest: realManifest });
    const req = new MockReq({
      url: '/data/v1/pricingData',
      method: 'GET',
      headers: { referer: 'https://localhost:3000' },
    });
    req.end();

    await expect(proxy.stream(req as IncomingMessage)).resolves.toBeInstanceOf(Response);
    expect(typeof proxy.express).toBe('function');
    expect(ryuuClientMocks.createClient).toHaveBeenCalledWith({
      instance: 'test.domo.com',
      refreshToken: 'test-refresh-token',
      clientId: 'domo:internal:devstudio',
      devToken: false,
      proxy: undefined,
    });
    expect(client.apps.getEnvironment).toHaveBeenCalledWith(realManifest, realManifest.proxyId);
    expect(client.request).toHaveBeenCalledWith(
      `${domainUrl}/data/v1/pricingData`,
      expect.objectContaining({ method: 'GET', rawResponse: true })
    );
  });

  it('preserves OAuth cookies from the legacy CLI login', async () => {
    const tokenKey = `${realManifest.proxyId}-domoapps-${realManifest.scopes?.join('-')}`;
    writeLogin({
      instance: 'test.domo.com',
      refreshToken: 'test-refresh-token',
      devToken: false,
      [`${tokenKey}-accessToken`]: 'oauth-access',
      [`${tokenKey}-refreshToken`]: 'oauth-refresh',
    });
    const client = createLegacyMockClient();
    ryuuClientMocks.createClient.mockReturnValue(client);
    const proxy = new Proxy({ manifest: realManifest });
    const req = new MockReq({
      url: '/api/data/v2/datasources',
      method: 'GET',
      headers: { referer: 'https://localhost:3000?userId=27' },
    });
    req.end();

    await proxy.stream(req as IncomingMessage);

    expect(client.request).toHaveBeenCalledWith(
      `${domainUrl}/api/data/v2/datasources`,
      expect.objectContaining({
        headers: expect.objectContaining({
          cookie: '_daatv1=oauth-access; _dartv1=oauth-refresh',
        }),
      })
    );
  });

  it('delegates the legacy express middleware after initialization', async () => {
    writeLogin();
    const client = createLegacyMockClient();
    vi.mocked(client.request).mockResolvedValue(new Response(null, { status: 204 }));
    ryuuClientMocks.createClient.mockReturnValue(client);
    const proxy = new Proxy({ manifest: realManifest });
    const req = new MockReq({
      url: '/data/v1/pricingData',
      method: 'GET',
      headers: { referer: 'https://localhost:3000' },
    });
    const res = {
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      end: vi.fn(),
      send: vi.fn(),
    } as any;
    req.end();

    proxy.express()(req as any, res, vi.fn());

    await vi.waitFor(() => expect(res.status).toHaveBeenCalledWith(204));
    expect(client.request).toHaveBeenCalledWith(
      `${domainUrl}/data/v1/pricingData`,
      expect.objectContaining({ method: 'GET', rawResponse: true })
    );
  });

  it('continues past non-Domo requests without requiring a login', () => {
    const proxy = new Proxy({ manifest: realManifest });
    const { express, stream } = proxy;
    const next = vi.fn();

    express()({ url: '/assets/app.js' } as any, {} as any, next);

    expect(next).toHaveBeenCalledOnce();
    expect(stream({ url: '/assets/app.js' } as IncomingMessage)).toBeUndefined();
  });

  it('surfaces the legacy authentication error when no login exists', async () => {
    const proxy = new Proxy({ manifest: realManifest });
    const req = new MockReq({ url: '/data/v1/test', method: 'GET' });
    req.end();

    await expect(proxy.stream(req as IncomingMessage)).rejects.toThrow(
      'Not authenticated. Please login using "domo login"'
    );
  });
});
