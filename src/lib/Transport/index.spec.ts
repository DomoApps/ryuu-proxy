import * as sinon from "sinon";
import MockReq from "mock-req";
import { IncomingMessage } from "http";
import { expect } from "chai";

import { default as Transport } from ".";
import { Manifest } from "../models";

const Domo = require("ryuu-client");

const proxyId = "textProxyId";

const manifest: Manifest = {
  proxyId,
  id: "test-id",
  name: "test-app",
  version: "1.0.0",
  size: { width: 1, height: 1 },
  draft: false,
  publicAssetsEnabled: false,
  flags: new Map<string, boolean>(),
  fullpage: false,
};

describe("Transport", () => {
  const lastLogin = "customer.domo.com";
  const domoDomain = {
    url: "https://88e99055-1520-440c-99a0-7b2a27469391.domoapps.test.domo.com",
  };

  let getDomainPromiseStub: sinon.SinonStub;

  beforeEach((done) => {
    getDomainPromiseStub = sinon
      .stub(Transport.prototype, "getDomainPromise")
      .returns(Promise.resolve(domoDomain));

    done();
  });

  afterEach(() => {
    getDomainPromiseStub.restore();
  });

  describe("when creating a new instance", () => {
    let getLastLoginStub: sinon.SinonStub;
    let client: Transport;

    beforeEach((done) => {
      getLastLoginStub = sinon
        .stub(Transport.prototype, "getLastLogin")
        .callsFake(() => {
          const domo = sinon.createStubInstance(Domo) as any;
          domo.getInstance.returns("test.domo.com");

          return Promise.resolve(domo);
        });

      client = new Transport({ manifest });

      done();
    });

    afterEach(() => {
      getLastLoginStub.restore();
    });

    it("should instantiate with no errors", () => {
      expect(Transport).to.exist;
      expect(Transport).to.be.an.instanceof(Function);

      expect(client).to.exist;
      expect(client).to.be.an.instanceof(Transport);
      expect(client.getManifest).to.exist;
    });
  });

  describe("getEnv()", () => {
    let getLastLoginStub;
    let client: Transport;

    beforeEach((done) => {
      getLastLoginStub = sinon
        .stub(Transport.prototype, "getLastLogin")
        .callsFake(() => {
          const domo = sinon.createStubInstance(Domo) as any;
          domo.getInstance.returns("test.domo.com");

          return Promise.resolve(domo);
        });

      client = new Transport({ manifest });

      done();
    });

    afterEach(() => {
      getLastLoginStub.restore();
    });

    it("should instantiate", () => {
      expect(client.getEnv).to.exist;
      expect(client.getEnv).to.be.an.instanceOf(Function);
    });

    it("should return env from instance string", () => {
      const env: string = client.getEnv("test.dev.domo.com");
      expect(env).to.equal("dev.domo.com");
    });
  });

  describe("getDomainPromise()", () => {
    let getLastLoginStub;
    let client: Transport;

    beforeEach((done) => {
      getDomainPromiseStub.restore();

      getLastLoginStub = sinon
        .stub(Transport.prototype, "getLastLogin")
        .callsFake(() => {
          const domo = sinon.createStubInstance(Domo) as any;
          domo.getInstance.returns("test.domo.com");
          domo.getDomoappsData.returns(
            Promise.resolve({
              url: "https://textProxyId.domoapps.dev2.domo.com",
            } as any)
          );

          return Promise.resolve(domo);
        });

      client = new Transport({ manifest });

      done();
    });

    afterEach(() => {
      getLastLoginStub.restore();
    });

    it("should instantiate", () => {
      expect(client.getDomainPromise).to.exist;
      expect(client.getDomainPromise).to.be.an.instanceOf(Function);
    });

    it("should return promise that resolves domain object", (done) => {
      const promise: Promise<any> = client.getDomainPromise();
      expect(promise).to.exist;
      promise.then((res) => {
        expect(res).to.exist;
        expect(res.url).to.exist;
        expect(res.url).to.include("domoapps.dev2.domo.com");
        done();
      });
    });
  });

  describe("build()", () => {
    const baseHeaders = {
      referer: "test.test?userId=27",
      accept: "application/json",
    };

    let getLastLoginStub;
    let getScopedOauthTokensStub;
    let client: Transport;

    beforeEach((done) => {
      getLastLoginStub = sinon
        .stub(Transport.prototype, "getLastLogin")
        .callsFake(() => {
          const domo = sinon.createStubInstance(Domo) as any;
          domo.getInstance.returns("test.domo.com");
          domo.getDomoappsData.returns(Promise.resolve(domoDomain as any));

          return Promise.resolve(domo);
        });

      getScopedOauthTokensStub = sinon
        .stub(Transport.prototype, "getScopedOauthTokens")
        .returns(Promise.resolve(undefined));

      client = new Transport({ manifest });

      done();
    });

    afterEach(() => {
      getLastLoginStub.restore();
      getScopedOauthTokensStub.restore();
    });

    it("should instantiate", () => {
      expect(client.build).to.exist;
      expect(client.build).to.be.an.instanceOf(Function);
    });

    it("should preserve referer when it has query params", (done) => {
      const req: Partial<IncomingMessage> = {
        url: "/data/v1/valid",
        headers: baseHeaders,
      };

      client
        .build(req as IncomingMessage)
        .then((options) => {
          expect(options.headers).to.have.property("referer");
          expect(options.headers!.referer).to.equal("test.test?userId=27");
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it("should pass through other headers", (done) => {
      const req: Partial<IncomingMessage> = {
        url: "/data/v1/valid",
        headers: {
          ...baseHeaders,
          "X-Custom-Header": "hello",
        },
      };

      client.build(req as IncomingMessage).then((options) => {
        expect(options.headers!.accept).to.equal("application/json");
        expect(options.headers!["X-Custom-Header"]).to.equal("hello");
        expect(options.headers!.referer).to.exist;
        done();
      });
    });

    it("should build full URL", (done) => {
      const req: Partial<IncomingMessage> = {
        url: "/data/v1/test?fields=field1,field2&avg=field2",
        headers: baseHeaders,
      };

      client.build(req as IncomingMessage).then((options) => {
        expect(options.url).to.equal(
          `${domoDomain.url}/data/v1/test?fields=field1,field2&avg=field2`
        );
        done();
      });
    });

    it("should use original request method", (done) => {
      const req: Partial<IncomingMessage> = {
        url: "/data/v1/valid",
        method: "it does not matter",
        headers: baseHeaders,
      };

      client.build(req as IncomingMessage).then((options) => {
        expect(options.method).to.equal(req.method);
        done();
      });
    });

    describe("parseBody", () => {
      const jsonBody = JSON.stringify({
        name: "json",
        message: "should not get mutated",
      });
      const textBody = "example,csv,string";
      let req;

      beforeEach(() => {
        req = new MockReq({
          url: "/data/v1/valid",
          method: "POST",
          headers: baseHeaders,
        });
      });

      describe("with JSON body", () => {
        beforeEach(() => {
          req.headers["Content-Type"] = "application/json";
        });

        it("should forward original body attribute", (done) => {
          req.body = jsonBody;
          req.end();
          client.build(req).then((options) => {
            expect(options.data).to.deep.equal(jsonBody);
            done();
          });
        });

        it("should forward original payload", (done) => {
          req.write(JSON.stringify(JSON.parse(jsonBody)));
          req.end();
          client.build(req).then((options) => {
            expect(options.data).to.exist;
            done();
          });
        });
      });

      describe("with text body", () => {
        beforeEach(() => {
          req.headers["Content-Type"] = "text/csv";
        });

        it("should forward original body attribute", (done) => {
          req.body = textBody;
          req.end();
          client.build(req).then((options) => {
            expect(options.data).to.deep.equal(textBody);
            done();
          });
        });

        it("should forward original payload", (done) => {
          req.write(textBody);
          req.end();
          client.build(req).then((options) => {
            expect(options.data).to.deep.equal(textBody);
            done();
          });
        });
      });
    });
  });

  describe("isDomoRequest()", () => {
    let getLastLoginStub;
    let client: Transport;

    beforeEach((done) => {
      getLastLoginStub = sinon
        .stub(Transport.prototype, "getLastLogin")
        .callsFake(() => {
          const domo = sinon.createStubInstance(Domo) as any;
          domo.getInstance.returns("test.domo.com");

          return Promise.resolve(domo);
        });

      client = new Transport({ manifest });

      done();
    });

    afterEach(() => {
      getLastLoginStub.restore();
    });

    it("should instantiate", () => {
      expect(client.isDomoRequest).to.exist;
      expect(client.isDomoRequest).to.be.an.instanceOf(Function);
    });

    it("should pass /domo requests", () => {
      expect(client.isDomoRequest("/domo/users/v1")).to.be.true;
      expect(client.isDomoRequest("/domo/avatars/v1")).to.be.true;
      expect(client.isDomoRequest("/domo/other/v1")).to.be.true;
    });

    it("should pass /data requests", () => {
      expect(client.isDomoRequest("/data/v1/alias")).to.be.true;
    });

    it("should pass /dql requests", () => {
      expect(client.isDomoRequest("/dql/v1/alias")).to.be.true;
    });

    it("should return false for invalid urls", () => {
      expect(client.isDomoRequest("/bad/url")).to.be.false;
      expect(client.isDomoRequest("/data/alias")).to.be.false;
      expect(client.isDomoRequest("/dql")).to.be.false;
    });
  });
});
