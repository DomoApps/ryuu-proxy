# domo-app-proxy

Simple middleware to add to a local development server while developing Domo Apps. The middleware will intercept any calls to `/data/v1` or `/domo/v1`, proxy an authenticated request to the Domo App service, and pipe the response back so that you can develop your Domo App locally and still get request data from Domo.

## Usage

### [Express](https://expressjs.com/) / [Connect](https://github.com/senchalabs/connect)

This library comes with a simple wrapper for Express/Connect middleware. 

```js
const express = require('express');
const { DomoAppProxy } = require('domo-app-proxy');

const app = express();

const manifest = require('./path/to/app/manifest.json');
const proxy = new DomoAppProxy(manifest);

app.use(proxy.express());
```

### Build Your Own

For other frameworks, the library exposes the necessary functions to create a stream to pipe back to your server. You'll need to handle this stream as your server would expect. The only thing that `stream()` expects is a standard Node [Request](https://nodejs.org/api/http.html#http_class_http_incomingmessage) which most server frameworks extend in some way.

```js
// koa
app.use(async (ctx, next) => {
  await proxy
    .stream(ctx.req)
    .then(data => ctx.body = ctx.req.pipe(data))
    .catch(next);
});
```

```js
// express
app.use((req, res, next) => {
  proxy
    .stream(req)
    .then(stream => stream.pipe(res))
    .catch(() => next());
});
```

```js
// node http
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    loadHomePage(res);
  } else {
    proxy
      .stream(req)
      .then(stream => stream.pipe(res));
  }
});
```
