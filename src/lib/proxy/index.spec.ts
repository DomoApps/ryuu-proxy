import * as Promise from 'core-js/library/fn/promise';
import { expect } from 'chai';
import proxy from '../proxy';

describe('lib: proxy', () => {
  it('should instantiate', () => {
    expect(proxy).to.exist;
    expect(proxy).to.be.an.instanceof(Function);
  });
});
