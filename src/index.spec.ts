import { expect } from 'chai';
import * as Proxy from '.';

describe('DomoProxy',() => {
  it('should instantiate', () => {
    expect(Proxy).to.exist;

    expect(Proxy.express).to.exist;
    expect(Proxy.express).to.be.an.instanceof(Function);

    expect(Proxy.koa).to.exist;
    expect(Proxy.koa).to.be.an.instanceof(Function);
  });
});
