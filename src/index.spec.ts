import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Proxy } from './index.js';
import Transport from './lib/Transport/index.js';
import type { Manifest } from './lib/models.js';
import type { RyuuClient } from 'ryuu-client';

const manifest: Manifest = {
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
    instance: 'test.dev.domo.com',
    refreshToken: 'test-token',
    designs: {} as any,
    assets: {} as any,
    apps: {
      createInstance: vi.fn(),
      getEnvironment: vi.fn().mockResolvedValue({
        url: 'https://test.domoapps.dev.domo.com',
      }),
    } as any,
    users: {} as any,
    login: vi.fn(),
    request: vi.fn(),
  };
}

describe('Proxy', () => {
  let client: Proxy;
  let clientStub: ReturnType<typeof vi.spyOn>;
  let domainStub: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clientStub = vi.spyOn(Transport.prototype, 'getLastLogin').mockReturnValue(
      Promise.resolve(createMockClient())
    );

    domainStub = vi.spyOn(Transport.prototype, 'getDomainPromise').mockReturnValue(
      Promise.resolve({ url: 'https://test.domoapps.dev.domo.com' })
    );

    client = new Proxy({ manifest });
  });

  afterEach(() => {
    clientStub.mockRestore();
    domainStub.mockRestore();
  });

  it('should instantiate', () => {
    expect(Proxy).toBeDefined();
    expect(typeof Proxy).toBe('function');
    expect(client).toBeDefined();
    expect(client).toBeInstanceOf(Proxy);
  });

  describe('express()', () => {
    it('should return express middleware', () => {
      const func = client.express();
      expect(func).toBeDefined();
      expect(typeof func).toBe('function');
      expect(func.length).toBe(3);
    });
  });

  describe('stream()', () => {
    it('should exist and be a function', () => {
      expect(client.stream).toBeDefined();
      expect(typeof client.stream).toBe('function');
    });
  });

  describe('constructor without authentication', () => {
    it('should not throw unhandled promise rejection when created without authentication', async () => {
      clientStub.mockRestore();
      domainStub.mockRestore();

      const getMostRecentLoginStub = vi.spyOn(Transport.prototype, 'getLastLogin').mockReturnValue(
        Promise.reject(new Error('Not authenticated. Please login using "domo login"'))
      );

      // Track unhandled rejections
      let unhandledRejection = false;
      const rejectionHandler = (reason: any) => {
        if (reason?.message?.includes('Not authenticated')) {
          unhandledRejection = true;
        }
      };

      process.on('unhandledRejection', rejectionHandler);

      new Proxy({ manifest });

      // Wait for any potential unhandled rejections
      await new Promise((resolve) => setTimeout(resolve, 100));

      process.removeListener('unhandledRejection', rejectionHandler);
      expect(unhandledRejection).toBe(false);

      getMostRecentLoginStub.mockRestore();
    });
  });
});
