import * as sinon from "sinon";
import { expect } from "chai";
import { Proxy } from ".";
import Transport from "./lib/Transport";
import { Manifest } from "./lib/models";

const Domo = require("ryuu-client");

describe("Proxy", () => {
  let client: Proxy;
  let clientStub: sinon.SinonStub;
  let domainStub: sinon.SinonStub;

  const manifest: Manifest = {
    id: "test-id",
    name: "test-app",
    version: "1.0.0",
    size: { width: 1, height: 1 },
    draft: false,
    publicAssetsEnabled: false,
    flags: new Map<string, boolean>(),
    fullpage: false,
  };

  beforeEach(() => {
    clientStub = sinon
      .stub(Transport.prototype, "getLastLogin")
      .returns(
        Promise.resolve(
          new Domo("test.dev.domo.com", "test-token", "client-id")
        )
      );

    domainStub = sinon
      .stub(Transport.prototype, "getDomainPromise")
      .returns(Promise.resolve({ url: "https://test.domoapps.dev.domo.com" }));

    client = new Proxy({ manifest });
  });

  afterEach(() => {
    clientStub.restore();
    domainStub.restore();
  });

  it("should instantiate", () => {
    expect(Proxy).to.exist;
    expect(Proxy).to.be.an.instanceof(Function);

    expect(client).to.exist;
    expect(client).to.be.an.instanceof(Proxy);
  });

  describe("express()", () => {
    it("should instantiate", () => {
      expect(client.express).to.exist;
      expect(client.express).to.be.an.instanceOf(Function);
    });

    it("should return express middleware", () => {
      const func = client.express();
      expect(func).to.exist;
      expect(func).to.be.an.instanceof(Function);
      expect(func.length).to.be.equal(3);
    });
  });

  describe("stream()", () => {
    it("should instantiate", () => {
      expect(client.stream).to.exist;
      expect(client.stream).to.be.an.instanceOf(Function);
    });
  });

  describe("constructor without authentication", () => {
    let originalEnv: NodeJS.ProcessEnv;
    let getMostRecentLoginStub: any;
    const utils = require("./lib/utils");

    beforeEach(() => {
      originalEnv = { ...process.env };
      clientStub.restore();
      domainStub.restore();
    });

    afterEach(() => {
      process.env = originalEnv;
      if (getMostRecentLoginStub) getMostRecentLoginStub.restore();
    });

    it("should not throw unhandled promise rejection when created without authentication", (done) => {
      // Simulate no authentication
      getMostRecentLoginStub = sinon.stub(utils, "getMostRecentLogin").resolves({});

      // Track if we get an unhandled rejection
      let unhandledRejection = false;
      const rejectionHandler = (reason: any) => {
        if (reason && reason.message && reason.message.includes("Not authenticated")) {
          unhandledRejection = true;
        }
      };

      process.on("unhandledRejection", rejectionHandler);

      // Create the proxy - this should not cause an unhandled promise rejection
      try {
        new Proxy({ manifest });

        // Wait a bit to see if unhandled rejection occurs
        setTimeout(() => {
          process.removeListener("unhandledRejection", rejectionHandler);

          // After our fix, this should NOT have an unhandled rejection
          if (unhandledRejection) {
            done(new Error("Unhandled promise rejection occurred during Proxy creation"));
          } else {
            done();
          }
        }, 100);
      } catch (err) {
        process.removeListener("unhandledRejection", rejectionHandler);
        done(err);
      }
    });
  });

  describe("constructor with proxy configuration", () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
      clientStub.restore();
      domainStub.restore();
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should configure HttpsProxyAgent with credentials", () => {
      process.env.PROXY_HOST = "proxy.test.com";
      process.env.PROXY_PORT = "8080";
      process.env.PROXY_USERNAME = "testuser";
      process.env.PROXY_PASSWORD = "testpass";

      clientStub = sinon
        .stub(Transport.prototype, "getLastLogin")
        .returns(
          Promise.resolve(
            new Domo("test.dev.domo.com", "test-token", "client-id")
          )
        );

      domainStub = sinon
        .stub(Transport.prototype, "getDomainPromise")
        .returns(
          Promise.resolve({ url: "https://test.domoapps.dev.domo.com" })
        );

      const proxyClient = new Proxy({ manifest });

      expect(proxyClient).to.exist;
      expect(proxyClient).to.be.an.instanceof(Proxy);
    });

    it("should configure HttpsProxyAgent without credentials", () => {
      process.env.PROXY_HOST = "proxy.test.com";
      process.env.PROXY_PORT = "8080";
      delete process.env.PROXY_USERNAME;
      delete process.env.PROXY_PASSWORD;

      clientStub = sinon
        .stub(Transport.prototype, "getLastLogin")
        .returns(
          Promise.resolve(
            new Domo("test.dev.domo.com", "test-token", "client-id")
          )
        );

      domainStub = sinon
        .stub(Transport.prototype, "getDomainPromise")
        .returns(
          Promise.resolve({ url: "https://test.domoapps.dev.domo.com" })
        );

      const proxyClient = new Proxy({ manifest });

      expect(proxyClient).to.exist;
      expect(proxyClient).to.be.an.instanceof(Proxy);
    });
  });
});
