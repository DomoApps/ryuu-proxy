# domo-app-proxy

Simple middleware to add to a local development server while developing Domo Apps. The middleware will intercept any calls to `/data/v1` or `/domo/v1`, proxy an authenticated request to the Domo App service, and pipe the response back so that you can develop your Domo App locally and still get request data from Domo.

## Installation

```
npm install @appteam6/domo-app-proxy --save-dev
```

## Usage

This library leverages the last login session from your Domo CLI. If that session is no longer active or doesn't exist then the proxy won't work. Be sure that you've logged in before you start working:

```
$ domo login
```

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

#### Error Handling

Ignoring the errors will cause the proxy to fail silently and the proxy request will return a `404` error. If you'd like a little more detail on the errors you can expose them in the response:

```js
// koa
app.use(async (ctx, next) => {
  await proxy
    .stream(ctx.req)
    .then(data => ctx.body = ctx.req.pipe(data))
    .catch((err) => {
      if (err.name === 'DomoException') {
        ctx.status = err.status || err.statusCode || 500;
        ctx.body = err;
      } else {
        next();
      }
    });
});
```

```js
// express / connect
app.use((req, res, next) => {
  proxy
    .stream(req)
    .then(stream => stream.pipe(res))
    .catch(err => {
      if (err.name === 'DomoException') {
        res.status(err.status || err.statusCode || 500).json(err);
      } else {
        next();
      }
    });
});
```

```js
// http
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    loadHomePage();
  } else {
    proxy
      .stream(req)
      .then(stream => stream.pipe(res))
      .catch(err => {
        if (err.name === 'DomoException') {
          res.writeHead(err.status || err.statusCode || 500);
          res.end(JSON.stringify(err));
        }
      });
  }
});
```
