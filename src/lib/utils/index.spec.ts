import * as sinon from 'sinon';
import { expect } from 'chai';
import * as glob from 'glob';
import Configstore from 'configstore';
const Domo = require('ryuu-client');

import * as utils from '.';
import { Manifest } from '../models';

describe('Utils', () => {
  describe('getMostRecentLogin()', () => {
    let getHomeDirStub: sinon.SinonStub;
    let globSyncStub: sinon.SinonStub | undefined;

    beforeEach(() => {
      getHomeDirStub = sinon.stub(Domo, 'getHomeDir').returns('/home/user');
    });

    afterEach(() => {
      getHomeDirStub.restore();
      if (globSyncStub) globSyncStub.restore();
    });

    it('should return empty object when no logins exist', async () => {
      globSyncStub = sinon.stub(glob, 'globSync').returns([]);

      const result = await utils.getMostRecentLogin();

      expect(result).to.deep.equal({});
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

      expect(utils.isOauthEnabled(manifest)).to.be.true;
    });

    it('should return false when oAuthEnabled is false', () => {
      const manifest = {
        id: 'test-id',
        name: 'test',
        version: '1.0.0',
        size: { width: 1, height: 1 },
        oAuthEnabled: false,
      } as unknown as Manifest;

      expect(utils.isOauthEnabled(manifest)).to.be.false;
    });

    it('should return false when oAuthEnabled is not present', () => {
      const manifest = {
        id: 'test-id',
        name: 'test',
        version: '1.0.0',
        size: { width: 1, height: 1 },
      } as Manifest;

      expect(utils.isOauthEnabled(manifest)).to.be.false;
    });
  });

  describe('getProxyId()', () => {
    let createUUIDStub: sinon.SinonStub;

    beforeEach(() => {
      createUUIDStub = sinon.stub(Domo, 'createUUID').returns('generated-uuid');
    });

    afterEach(() => {
      createUUIDStub.restore();
    });

    it('should return manifest proxyId when present', () => {
      const manifest = {
        id: 'test-id',
        name: 'test',
        version: '1.0.0',
        size: { width: 1, height: 1 },
        proxyId: 'existing-proxy-id',
      } as Manifest;

      expect(utils.getProxyId(manifest)).to.equal('existing-proxy-id');
    });

    it('should generate UUID when proxyId is not present', () => {
      const manifest = {
        id: 'test-id',
        name: 'test',
        version: '1.0.0',
        size: { width: 1, height: 1 },
      } as Manifest;

      expect(utils.getProxyId(manifest)).to.equal('generated-uuid');
    });
  });

  describe('getOauthTokens()', () => {
    let getMostRecentLoginStub: sinon.SinonStub;
    let configstoreGetStub: sinon.SinonStub;

    beforeEach(() => {
      configstoreGetStub = sinon.stub(Configstore.prototype, 'get');
    });

    afterEach(() => {
      if (getMostRecentLoginStub) getMostRecentLoginStub.restore();
      configstoreGetStub.restore();
    });

    it('should return OAuth tokens with default scopes', async () => {
      getMostRecentLoginStub = sinon.stub(utils, 'getMostRecentLogin').resolves({ instance: 'test.domo.com' });

      configstoreGetStub
        .withArgs('test-proxy-id-domoapps-accessToken')
        .returns('test-access-token')
        .withArgs('test-proxy-id-domoapps-refreshToken')
        .returns('test-refresh-token');

      const result = await utils.getOauthTokens('test-proxy-id', undefined);

      expect(result).to.deep.equal({
        access: 'test-access-token',
        refresh: 'test-refresh-token',
      });
    });

    it('should return OAuth tokens with custom scopes', async () => {
      getMostRecentLoginStub = sinon.stub(utils, 'getMostRecentLogin').resolves({ instance: 'test.domo.com' });

      configstoreGetStub
        .withArgs('test-proxy-id-domoapps-custom1-custom2-accessToken')
        .returns('test-access-token')
        .withArgs('test-proxy-id-domoapps-custom1-custom2-refreshToken')
        .returns('test-refresh-token');

      const result = await utils.getOauthTokens('test-proxy-id', ['custom1', 'custom2']);

      expect(result).to.deep.equal({
        access: 'test-access-token',
        refresh: 'test-refresh-token',
      });
    });
  });
});
