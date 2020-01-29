const { Proxy } = require("@domoinc/ryuu-proxy");
const manifest = require("./domo/manifest.json");
const server = require("express")();

const config = {
  manifest: manifest
};
const proxy = new Proxy(config);

server.use(proxy.express());

server.listen("3000", () => {
  console.log("Proxy server running on port ", 3000);
});
