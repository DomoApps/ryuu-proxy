# ryuu-proxy

Simple middleware to add to a local development server while developing Domo Apps. The middleware will intercept any calls to `/data/v{d}`, `/sql/v{d}`, `/dql/v{d}` or `/domo/.../v{d}`, proxy an authenticated request to the Domo App service, and pipe the response back so that you can develop your Domo App locally and still get request data from Domo.

## Installation

```
npm install @domoinc/ryuu-proxy --save-dev
```

## Usage

This library leverages the last login session from your Domo CLI. If that session is no longer active or doesn't exist then the proxy won't work. Be sure that you've logged in before you start working:

```
$ domo login
```

### Configuration
```js
const { Proxy } = require('@domoinc/ryuu-proxy');
const manifest = require('./path/to/app/manifest.json');

const config = { manifest };

// use `proxy` in your development server
const proxy = new Proxy(config);
```

The proxy constructor expects a `config` object. Certain properties are required and others are optional.
#### Required Configuration Properties
- `manifest`: The parsed contents of a project's manifest.json file. `domo publish` have been run at least once to ensure the `manifest.json` file has an `id` property

#### Optional Configuration Properties
- `manifest.proxyId`: An advanced property required for projects leveraging DQL, writebacks, or Oauth. If you are unsure of whether or not you need this, you most likely don't. To get a proxyId, see "Getting a proxyId" below

### With [Express](https://expressjs.com/) / [Connect](https://github.com/senchalabs/connect)

This library comes with a simple wrapper for Express/Connect middleware. 

```js
const app = express();
app.use(proxy.express());
```

### With Other Frameworks

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

## Getting a proxyId (Advanced)
Apps using DQL, writeback, or oAuth features are required to supply an proxyId as part of the proxy configuration. This allows the proxy to know how to properly route requests. The proxyId can be found as part of the URL for the iframe in which your app is displayed. It will be of the form `XXXXXXXX-XXXX-4XXX-XXXX-XXXXXXXXXXXX`. To find the ID:
1. Make sure the app has been published at least once with `domo publish`
2. Publish a new card based on your app design, or navigate to an existing card made from your app design
3. Right-click anywhere in the card and choose "Inspect element"
4. Find the `<iframe>` that contains your app's code. The URL should be of the form `//{HASH}.domoapps.prodX.domo.com?userId=...`
5. Copy the ID found between `//` and `.domoapps`. That is your app's `proxyId`

`proxyId`s tie apps to cards. If you delete the card from which you retrieved the proxyId, you will have to get a new one from another card created from your app design.
