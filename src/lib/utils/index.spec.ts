import * as Promise from 'core-js/library/fn/promise';
import { expect } from 'chai';
import {
  getDomoClient,
  createContext,
  getDomoDomain,
  createUUID,
  getEnv,
} from '../utils';

describe('lib: utils', () => {
  describe('createUUID()', () => {
    it('should instantiate', () => {
      expect(createUUID).to.exist;
      expect(createUUID).to.be.an.instanceOf(Function);
    });

    it('should return UUID formatted string', () => {
      const uuid: string = createUUID();
      const pattern = /[a-z0-9]{8}-([a-z0-9]{4}-){3}[a-z0-9]{12}/g;
      expect(pattern.test(uuid)).to.be.true;
    });
  });
});
