import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Configstore from 'configstore';

import * as utils from './index.js';
import type { Manifest } from '../models.js';

// Mock ryuu-client
vi.mock('ryuu-client', () => ({
  getHomeDir: vi.fn(() => '/home/user/.config/configstore'),
}));

// Mock tinyglobby
vi.mock('tinyglobby', () => ({
  globSync: vi.fn(() => []),
}));

// Mock fs-extra
vi.mock('fs-extra', () => ({
  default: {
    statSync: vi.fn(),
    readJsonSync: vi.fn(),
  },
  statSync: vi.fn(),
  readJsonSync: vi.fn(),
}));

// Mock node:crypto
vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => 'generated-uuid'),
}));

describe('Utils', () => {
  describe('getMostRecentLogin()', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return empty object when no logins exist', async () => {
      const { globSync } = await import('tinyglobby');
      vi.mocked(globSync).mockReturnValue([]);

      const result = await utils.getMostRecentLogin();
      expect(result).toEqual({});
    });
  });

  describe('isOauthEnabled()', () => {
    it('should return true when oAuthEnabled is true', () => {
      const manifest = {
        id: 'test-id',
        name: 'test',
        version: '1.0.0',
        size: { width: 1, height: 1 },
        oAuthEnabled: true,
      } as unknown as Manifest;

      expect(utils.isOauthEnabled(manifest)).toBe(true);
    });

    it('should return false when oAuthEnabled is false', () => {
      const manifest = {
        id: 'test-id',
        name: 'test',
        version: '1.0.0',
        size: { width: 1, height: 1 },
        oAuthEnabled: false,
      } as unknown as Manifest;

      expect(utils.isOauthEnabled(manifest)).toBe(false);
    });

    it('should return false when oAuthEnabled is not present', () => {
      const manifest = {
        id: 'test-id',
        name: 'test',
        version: '1.0.0',
        size: { width: 1, height: 1 },
      } as Manifest;

      expect(utils.isOauthEnabled(manifest)).toBe(false);
    });
  });

  describe('getProxyId()', () => {
    it('should return manifest proxyId when present', () => {
      const manifest = {
        id: 'test-id',
        name: 'test',
        version: '1.0.0',
        size: { width: 1, height: 1 },
        proxyId: 'existing-proxy-id',
      } as Manifest;

      expect(utils.getProxyId(manifest)).toBe('existing-proxy-id');
    });

    it('should generate UUID when proxyId is not present', () => {
      const manifest = {
        id: 'test-id',
        name: 'test',
        version: '1.0.0',
        size: { width: 1, height: 1 },
      } as Manifest;

      expect(utils.getProxyId(manifest)).toBe('generated-uuid');
    });
  });

  describe('getOauthTokens()', () => {
    let configstoreGetSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      configstoreGetSpy = vi.spyOn(Configstore.prototype, 'get');
    });

    afterEach(() => {
      configstoreGetSpy.mockRestore();
    });

    it('should return OAuth tokens with default scopes', async () => {
      const getMostRecentLoginSpy = vi.spyOn(utils, 'getMostRecentLogin').mockResolvedValue({ instance: 'test.domo.com' });

      configstoreGetSpy
        .mockImplementation((key: string) => {
          if (key === 'test-proxy-id-domoapps-accessToken') return 'test-access-token';
          if (key === 'test-proxy-id-domoapps-refreshToken') return 'test-refresh-token';
          return undefined;
        });

      const result = await utils.getOauthTokens('test-proxy-id', undefined);

      expect(result).toEqual({
        access: 'test-access-token',
        refresh: 'test-refresh-token',
      });

      getMostRecentLoginSpy.mockRestore();
    });

    it('should return OAuth tokens with custom scopes', async () => {
      const getMostRecentLoginSpy = vi.spyOn(utils, 'getMostRecentLogin').mockResolvedValue({ instance: 'test.domo.com' });

      configstoreGetSpy
        .mockImplementation((key: string) => {
          if (key === 'test-proxy-id-domoapps-custom1-custom2-accessToken') return 'test-access-token';
          if (key === 'test-proxy-id-domoapps-custom1-custom2-refreshToken') return 'test-refresh-token';
          return undefined;
        });

      const result = await utils.getOauthTokens('test-proxy-id', ['custom1', 'custom2']);

      expect(result).toEqual({
        access: 'test-access-token',
        refresh: 'test-refresh-token',
      });

      getMostRecentLoginSpy.mockRestore();
    });
  });
});
