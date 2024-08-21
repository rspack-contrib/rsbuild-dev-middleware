<div align="center">
  <a href="https://github.com/webpack/webpack">
    <img width="200" height="200" src="https://webpack.js.org/assets/icon-square-big.svg">
  </a>
</div>

[![npm][npm]][npm-url]
[![node][node]][node-url]
[![tests][tests]][tests-url]
[![coverage][cover]][cover-url]
[![discussion][discussion]][discussion-url]
[![size][size]][size-url]

# webpack-dev-middleware

An express-style development middleware for use with [webpack](https://webpack.js.org)
bundles and allows for serving of the files emitted from webpack.
This should be used for **development only**.

Some of the benefits of using this middleware include:

- No files are written to disk, rather it handles files in memory
- If files changed in watch mode, the middleware delays requests until compiling
  has completed.
- Supports hot module reload (HMR).

## Getting Started

First thing's first, install the module:

```console
npm install webpack-dev-middleware --save-dev
```

> **Warning**
>
> _We do not recommend installing this module globally._

## Usage

```js
const webpack = require("webpack");
const middleware = require("webpack-dev-middleware");
const compiler = webpack({
  // webpack options
});
const express = require("express");
const app = express();

app.use(
  middleware(compiler, {
    // webpack-dev-middleware options
  }),
);

app.listen(3000, () => console.log("Example app listening on port 3000!"));
```

## Options

|                      Name                       |             Type              |                    Default                    | Description                                                                                                          |
| :---------------------------------------------: | :---------------------------: | :-------------------------------------------: | :------------------------------------------------------------------------------------------------------------------- |
|              **[`index`](#index)**              |       `Boolean\|String`       |                 `index.html`                  | If `false` (but not `undefined`), the server will not respond to requests to the root URL.                           |
|               **[`etag`](#tag)**                | `boolean\| "weak"\| "strong"` |                  `undefined`                  | Enable or disable etag generation.                                                                                   |
|         **[`publicPath`](#publicpath)**         |           `String`            |  `output.publicPath` (from a configuration)   | The public path that the middleware is bound to.                                                                     |
|        **[`writeToDisk`](#writetodisk)**        |      `Boolean\|Function`      |                    `false`                    | Instructs the module to write files to the configured location on disk as specified in your `webpack` configuration. |
|   **[`outputFileSystem`](#outputfilesystem)**   |           `Object`            | [`memfs`](https://github.com/streamich/memfs) | Set the default file system which will be used by webpack as primary destination of generated files.                 |

The middleware accepts an `options` Object. The following is a property reference for the Object.

### index

Type: `Boolean|String`
Default: `index.html`

If `false` (but not `undefined`), the server will not respond to requests to the root URL.

### etag

Type: `"weak" | "strong"`  
Default: `undefined`

Enable or disable etag generation. Boolean value use

### lastModified

Type: `Boolean`
Default: `undefined`

Enable or disable `Last-Modified` header. Uses the file system's last modified value.

### publicPath

Type: `String`
Default: `output.publicPath` (from a configuration)

The public path that the middleware is bound to.

_Best Practice: use the same `publicPath` defined in your webpack config. For more information about `publicPath`, please see [the webpack documentation](https://webpack.js.org/guides/public-path)._

### writeToDisk

Type: `Boolean|Function`  
Default: `false`

If `true`, the option will instruct the module to write files to the configured location on disk as specified in your `webpack` config file.
_Setting `writeToDisk: true` won't change the behavior of the `webpack-dev-middleware`, and bundle files accessed through the browser will still be served from memory._
This option provides the same capabilities as the [`WriteFilePlugin`](https://github.com/gajus/write-file-webpack-plugin/pulls).

This option also accepts a `Function` value, which can be used to filter which files are written to disk.
The function follows the same premise as [`Array#filter`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter) in which a return value of `false` _will not_ write the file, and a return value of `true` _will_ write the file to disk. eg.

```js
const webpack = require("webpack");
const configuration = {
  /* Webpack configuration */
};
const compiler = webpack(configuration);

middleware(compiler, {
  writeToDisk: (filePath) => {
    return /superman\.css$/.test(filePath);
  },
});
```

### outputFileSystem

Type: `Object`  
Default: [memfs](https://github.com/streamich/memfs)

Set the default file system which will be used by webpack as primary destination of generated files.
This option isn't affected by the [writeToDisk](#writeToDisk) option.

You have to provide `.join()` and `mkdirp` method to the `outputFileSystem` instance manually for compatibility with `webpack@4`.

This can be done simply by using `path.join`:

```js
const webpack = require("webpack");
const path = require("path");
const myOutputFileSystem = require("my-fs");
const mkdirp = require("mkdirp");

myOutputFileSystem.join = path.join.bind(path); // no need to bind
myOutputFileSystem.mkdirp = mkdirp.bind(mkdirp); // no need to bind

const compiler = webpack({
  /* Webpack configuration */
});

middleware(compiler, { outputFileSystem: myOutputFileSystem });
```

## API

`webpack-dev-middleware` also provides convenience methods that can be use to
interact with the middleware at runtime:

### `close(callback)`

Instructs `webpack-dev-middleware` instance to stop watching for file changes.

#### Parameters

##### `callback`

Type: `Function`
Required: `No`

A function executed once the middleware has stopped watching.

```js
const express = require("express");
const webpack = require("webpack");
const compiler = webpack({
  /* Webpack configuration */
});
const middleware = require("webpack-dev-middleware");
const instance = middleware(compiler);

const app = new express();

app.use(instance);

setTimeout(() => {
  // Says `webpack` to stop watch changes
  instance.close();
}, 1000);
```

### `invalidate(callback)`

Instructs `webpack-dev-middleware` instance to recompile the bundle, e.g. after a change to the configuration.

#### Parameters

##### `callback`

Type: `Function`
Required: `No`

A function executed once the middleware has invalidated.

```js
const express = require("express");
const webpack = require("webpack");
const compiler = webpack({
  /* Webpack configuration */
});
const middleware = require("webpack-dev-middleware");
const instance = middleware(compiler);

const app = new express();

app.use(instance);

setTimeout(() => {
  // After a short delay the configuration is changed and a banner plugin is added to the config
  new webpack.BannerPlugin("A new banner").apply(compiler);

  // Recompile the bundle with the banner plugin:
  instance.invalidate();
}, 1000);
```

### `waitUntilValid(callback)`

Executes a callback function when the compiler bundle is valid, typically after
compilation.

#### Parameters

##### `callback`

Type: `Function`
Required: `No`

A function executed when the bundle becomes valid.
If the bundle is valid at the time of calling, the callback is executed immediately.

```js
const express = require("express");
const webpack = require("webpack");
const compiler = webpack({
  /* Webpack configuration */
});
const middleware = require("webpack-dev-middleware");
const instance = middleware(compiler);

const app = new express();

app.use(instance);

instance.waitUntilValid(() => {
  console.log("Package is in a valid state");
});
```

### `getFilenameFromUrl(url)`

Get filename from URL.

#### Parameters

##### `url`

Type: `String`
Required: `Yes`

URL for the requested file.

```js
const express = require("express");
const webpack = require("webpack");
const compiler = webpack({
  /* Webpack configuration */
});
const middleware = require("webpack-dev-middleware");
const instance = middleware(compiler);

const app = new express();

app.use(instance);

instance.waitUntilValid(() => {
  const filename = instance.getFilenameFromUrl("/bundle.js");

  console.log(`Filename is ${filename}`);
});
```

## FAQ

### Avoid blocking requests to non-webpack resources.

Since `output.publicPath` and `output.filename`/`output.chunkFilename` can be dynamic, it's not possible to know which files are webpack bundles (and they public paths) and which are not, so we can't avoid blocking requests.

But there is a solution to avoid it - mount the middleware to a non-root route, for example:

```js
const webpack = require("webpack");
const middleware = require("webpack-dev-middleware");
const compiler = webpack({
  // webpack options
});
const express = require("express");
const app = express();

// Mounting the middleware to the non-root route allows avoids this.
// Note - check your public path, if you want to handle `/dist/`, you need to setup `output.publicPath` to `/` value.
app.use(
  "/dist/",
  middleware(compiler, {
    // webpack-dev-middleware options
  }),
);

app.listen(3000, () => console.log("Example app listening on port 3000!"));
```

## Server-Side Rendering

_Note: this feature is experimental and may be removed or changed completely in the future._

In order to develop an app using server-side rendering, we need access to the
[`stats`](https://github.com/webpack/docs/wiki/node.js-api#stats), which is
generated with each build.

With server-side rendering enabled, `webpack-dev-middleware` sets the `stats` to `res.locals.webpack.devMiddleware.stats`
and the filesystem to `res.locals.webpack.devMiddleware.outputFileSystem` before invoking the next middleware,
allowing a developer to render the page body and manage the response to clients.

_Note: Requests for bundle files will still be handled by
`webpack-dev-middleware` and all requests will be pending until the build
process is finished with server-side rendering enabled._

Example Implementation:

```js
const express = require("express");
const webpack = require("webpack");
const compiler = webpack({
  /* Webpack configuration */
});
const isObject = require("is-object");
const middleware = require("webpack-dev-middleware");

const app = new express();

// This function makes server rendering of asset references consistent with different webpack chunk/entry configurations
function normalizeAssets(assets) {
  if (isObject(assets)) {
    return Object.values(assets);
  }

  return Array.isArray(assets) ? assets : [assets];
}

app.use(middleware(compiler));

// The following middleware would not be invoked until the latest build is finished.
app.use((req, res) => {
  const { devMiddleware } = res.locals.webpack;
  const outputFileSystem = devMiddleware.outputFileSystem;
  const jsonWebpackStats = devMiddleware.stats.toJson();
  const { assetsByChunkName, outputPath } = jsonWebpackStats;

  // Then use `assetsByChunkName` for server-side rendering
  // For example, if you have only one main chunk:
  res.send(`
<html>
  <head>
    <title>My App</title>
    <style>
    ${normalizeAssets(assetsByChunkName.main)
      .filter((path) => path.endsWith(".css"))
      .map((path) => outputFileSystem.readFileSync(path.join(outputPath, path)))
      .join("\n")}
    </style>
  </head>
  <body>
    <div id="root"></div>
    ${normalizeAssets(assetsByChunkName.main)
      .filter((path) => path.endsWith(".js"))
      .map((path) => `<script src="${path}"></script>`)
      .join("\n")}
  </body>
</html>
  `);
});
```

## Support

We do our best to keep Issues in the repository focused on bugs, features, and
needed modifications to the code for the module. Because of that, we ask users
with general support, "how-to", or "why isn't this working" questions to try one
of the other support channels that are available.

Your first-stop-shop for support for webpack-dev-server should by the excellent
[documentation][docs-url] for the module. If you see an opportunity for improvement
of those docs, please head over to the [webpack.js.org repo][wjo-url] and open a
pull request.

From there, we encourage users to visit the [webpack discussions][chat-url] and
talk to the fine folks there. If your quest for answers comes up dry in chat,
head over to [StackOverflow][stack-url] and do a quick search or open a new
question. Remember; It's always much easier to answer questions that include your
`webpack.config.js` and relevant files!

If you're twitter-savvy you can tweet [#webpack][hash-url] with your question
and someone should be able to reach out and lend a hand.

If you have discovered a :bug:, have a feature suggestion, or would like to see
a modification, please feel free to create an issue on Github. _Note: The issue
template isn't optional, so please be sure not to remove it, and please fill it
out completely._

## Other servers

Examples of use with other servers will follow here.

### Connect

```js
const connect = require("connect");
const http = require("http");
const webpack = require("webpack");
const webpackConfig = require("./webpack.config.js");
const devMiddleware = require("webpack-dev-middleware");

const compiler = webpack(webpackConfig);
const devMiddlewareOptions = {
  /** Your webpack-dev-middleware-options */
};
const app = connect();

app.use(devMiddleware(compiler, devMiddlewareOptions));

http.createServer(app).listen(3000);
```

### Router

```js
const http = require("http");
const Router = require("router");
const finalhandler = require("finalhandler");
const webpack = require("webpack");
const webpackConfig = require("./webpack.config.js");
const devMiddleware = require("webpack-dev-middleware");

const compiler = webpack(webpackConfig);
const devMiddlewareOptions = {
  /** Your webpack-dev-middleware-options */
};
const router = Router();

router.use(devMiddleware(compiler, devMiddlewareOptions));

var server = http.createServer((req, res) => {
  router(req, res, finalhandler(req, res));
});

server.listen(3000);
```

### Express

```js
const express = require("express");
const webpack = require("webpack");
const webpackConfig = require("./webpack.config.js");
const devMiddleware = require("webpack-dev-middleware");

const compiler = webpack(webpackConfig);
const devMiddlewareOptions = {
  /** Your webpack-dev-middleware-options */
};
const app = express();

app.use(devMiddleware(compiler, devMiddlewareOptions));

app.listen(3000, () => console.log("Example app listening on port 3000!"));
```

## Contributing

Please take a moment to read our contributing guidelines if you haven't yet done so.

[CONTRIBUTING](./CONTRIBUTING.md)

## License

[MIT](./LICENSE)

[npm]: https://img.shields.io/npm/v/webpack-dev-middleware.svg
[npm-url]: https://npmjs.com/package/webpack-dev-middleware
[node]: https://img.shields.io/node/v/webpack-dev-middleware.svg
[node-url]: https://nodejs.org
[tests]: https://github.com/webpack/webpack-dev-middleware/workflows/webpack-dev-middleware/badge.svg
[tests-url]: https://github.com/webpack/webpack-dev-middleware/actions
[cover]: https://codecov.io/gh/webpack/webpack-dev-middleware/branch/master/graph/badge.svg
[cover-url]: https://codecov.io/gh/webpack/webpack-dev-middleware
[discussion]: https://img.shields.io/github/discussions/webpack/webpack
[discussion-url]: https://github.com/webpack/webpack/discussions
[size]: https://packagephobia.com/badge?p=webpack-dev-middleware
[size-url]: https://packagephobia.com/result?p=webpack-dev-middleware
[docs-url]: https://webpack.js.org/guides/development/#using-webpack-dev-middleware
[hash-url]: https://twitter.com/search?q=webpack
[middleware-url]: https://github.com/webpack/webpack-dev-middleware
[stack-url]: https://stackoverflow.com/questions/tagged/webpack-dev-middleware
[chat-url]: https://github.com/webpack/webpack/discussions
[wjo-url]: https://github.com/webpack/webpack.js.org
