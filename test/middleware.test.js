import fs from "fs";
import path from "path";

import connect from "connect";
import express from "express";
import router from "router";
import finalhandler from "finalhandler";
import request from "supertest";
import del from "del";

import { Stats } from "webpack";

import middleware from "../src";

import getCompiler from "./helpers/getCompiler";

import webpackConfig from "./fixtures/webpack.config";
import webpackMultiConfig from "./fixtures/webpack.array.config";
import webpackWatchOptionsConfig from "./fixtures/webpack.watch-options.config";
import webpackMultiWatchOptionsConfig from "./fixtures/webpack.array.watch-options.config";
import webpackQueryStringConfig from "./fixtures/webpack.querystring.config";
import webpackClientServerConfig from "./fixtures/webpack.client.server.config";
import getCompilerHooks from "./helpers/getCompilerHooks";
import webpackPublicPathConfig from "./fixtures/webpack.public-path.config";

// Suppress unnecessary stats output
global.console.log = jest.fn();

async function startServer(name, app) {
  return new Promise((resolve, reject) => {
    if (name === "router") {
      // eslint-disable-next-line global-require
      const server = require("http").createServer((req, res) => {
        app(req, res, finalhandler(req, res));
      });

      server.listen({ port: 3000 }, (error) => {
        if (error) {
          return reject(error);
        }

        return resolve(server);
      });
    } else {
      const server = app.listen({ port: 3000 }, (error) => {
        if (error) {
          return reject(error);
        }

        return resolve(server);
      });
    }
  });
}

async function frameworkFactory(
  name,
  framework,
  compiler,
  devMiddlewareOptions,
  options = {},
) {
  switch (name) {
    default: {
      const isRouter = name === "router";
      const app = framework();

      const instance = middleware(compiler, devMiddlewareOptions);
      const middlewares =
        typeof options.setupMiddlewares === "function"
          ? options.setupMiddlewares([instance])
          : [instance];

      for (const item of middlewares) {
        if (item.route) {
          app.use(item.route, item.fn);
        } else {
          app.use(item);
        }
      }

      const server = await startServer(name, app);
      const req = isRouter ? request(server) : request(app);

      return [server, req, instance];
    }
  }
}

async function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);

        return;
      }

      resolve();
    });
  });
}

async function close(server, instance) {
  return Promise.resolve()
    .then(() => {
      if (!instance.context.watching.closed) {
        return new Promise((resolve, reject) => {
          instance.close((err) => {
            if (err) {
              reject(err);
              return;
            }

            resolve();
          });
        });
      }

      return Promise.resolve();
    })
    .then(() => {
      if (server) {
        return closeServer(server);
      }

      return Promise.resolve();
    });
}

function get404ContentTypeHeader(name) {
  switch (name) {
    default:
      return "text/html; charset=utf-8";
  }
}

function parseHttpDate(date) {
  const timestamp = date && Date.parse(date);

  // istanbul ignore next: guard against date.js Date.parse patching
  return typeof timestamp === "number" ? timestamp : NaN;
}

describe.each([
  ["connect", connect],
  ["express", express],
  ["router", router],
])("%s framework:", (name, framework) => {
  describe("middleware", () => {
    let instance;
    let server;
    let req;

    describe("API", () => {
      let compiler;

      describe("constructor", () => {
        describe("should accept compiler", () => {
          beforeEach(async () => {
            compiler = getCompiler(webpackConfig);

            [server, req, instance] = await frameworkFactory(
              name,
              framework,
              compiler,
            );
          });

          afterEach(async () => {
            await close(server, instance);
          });

          it("should work", (done) => {
            const doneSpy = jest.spyOn(
              getCompilerHooks(compiler).done[0],
              "fn",
            );

            instance.waitUntilValid(() => {
              instance.close();

              expect(compiler.running).toBe(false);
              expect(doneSpy).toHaveBeenCalledTimes(1);

              doneSpy.mockRestore();

              done();
            });
          });
        });

        describe("should accept compiler in watch mode", () => {
          beforeEach(async () => {
            compiler = getCompiler({ ...webpackConfig, ...{ watch: true } });

            instance = middleware(compiler);

            [server, req, instance] = await frameworkFactory(
              name,
              framework,
              compiler,
            );
          });

          afterEach(async () => {
            await close(server, instance);
          });

          it("should work", (done) => {
            const doneSpy = jest.spyOn(
              getCompilerHooks(compiler).done[0],
              "fn",
            );

            instance.waitUntilValid(() => {
              instance.close();

              expect(compiler.running).toBe(false);
              expect(doneSpy).toHaveBeenCalledTimes(1);

              doneSpy.mockRestore();

              done();
            });
          });
        });
      });

      describe("waitUntilValid method", () => {
        beforeEach(async () => {
          compiler = getCompiler(webpackConfig);

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
          );
        });

        afterEach(async () => {
          await close(server, instance);
        });

        it("should work without callback", (done) => {
          const doneSpy = jest.spyOn(getCompilerHooks(compiler).done[0], "fn");

          instance.waitUntilValid();

          const intervalId = setInterval(() => {
            if (instance.context.state) {
              expect(compiler.running).toBe(true);
              expect(instance.context.state).toBe(true);
              expect(doneSpy).toHaveBeenCalledTimes(1);
              expect(doneSpy.mock.calls[0][0]).toBeInstanceOf(Stats);

              doneSpy.mockRestore();

              clearInterval(intervalId);

              done();
            }
          });
        });

        it("should work with callback", (done) => {
          const doneSpy = jest.spyOn(getCompilerHooks(compiler).done[0], "fn");
          let callbackCounter = 0;

          instance.waitUntilValid(() => {
            callbackCounter += 1;
          });

          const intervalId = setInterval(() => {
            if (instance.context.state) {
              expect(compiler.running).toBe(true);
              expect(instance.context.state).toBe(true);
              expect(callbackCounter).toBe(1);
              expect(doneSpy).toHaveBeenCalledTimes(1);

              doneSpy.mockRestore();

              clearInterval(intervalId);

              done();
            }
          });
        });

        it("should run callback immediately when state already valid", (done) => {
          const doneSpy = jest.spyOn(getCompilerHooks(compiler).done[0], "fn");
          let callbackCounter = 0;
          let validToCheck = false;

          instance.waitUntilValid(() => {
            callbackCounter += 1;

            instance.waitUntilValid(() => {
              validToCheck = true;
              callbackCounter += 1;
            });
          });

          const intervalId = setInterval(() => {
            if (instance.context.state && validToCheck) {
              expect(compiler.running).toBe(true);
              expect(instance.context.state).toBe(true);
              expect(callbackCounter).toBe(2);
              expect(doneSpy).toHaveBeenCalledTimes(1);

              doneSpy.mockRestore();

              clearInterval(intervalId);

              done();
            }
          });
        });
      });

      describe("invalidate method", () => {
        beforeEach(async () => {
          compiler = getCompiler(webpackConfig);

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
          );
        });

        afterEach(async () => {
          await close(server, instance);
        });

        it("should work without callback", (done) => {
          const doneSpy = jest.spyOn(getCompilerHooks(compiler).done[0], "fn");

          instance.invalidate();

          const intervalId = setInterval(() => {
            if (instance.context.state) {
              expect(compiler.running).toBe(true);
              expect(instance.context.state).toBe(true);
              expect(doneSpy).toHaveBeenCalledTimes(1);

              doneSpy.mockRestore();

              clearInterval(intervalId);

              done();
            }
          });
        });

        it("should work with callback", (done) => {
          const doneSpy = jest.spyOn(getCompilerHooks(compiler).done[0], "fn");
          let callbackCounter = 0;

          instance.invalidate(() => {
            callbackCounter += 1;
          });

          const intervalId = setInterval(() => {
            if (instance.context.state) {
              expect(compiler.running).toBe(true);
              expect(instance.context.state).toBe(true);
              expect(callbackCounter).toBe(1);
              expect(doneSpy).toHaveBeenCalledTimes(1);

              doneSpy.mockRestore();

              clearInterval(intervalId);

              done();
            }
          });
        });
      });

      describe("getFilenameFromUrl method", () => {
        describe("should work", () => {
          beforeEach(async () => {
            compiler = getCompiler(webpackConfig);

            [server, req, instance] = await frameworkFactory(
              name,
              framework,
              compiler,
            );
          });

          afterEach(async () => {
            await close(server, instance);
          });

          it("should work", (done) => {
            instance.waitUntilValid(() => {
              expect(instance.getFilenameFromUrl("/bundle.js")).toBe(
                path.join(webpackConfig.output.path, "/bundle.js"),
              );
              expect(instance.getFilenameFromUrl("/")).toBe(
                path.join(webpackConfig.output.path, "/index.html"),
              );
              expect(instance.getFilenameFromUrl("/index.html")).toBe(
                path.join(webpackConfig.output.path, "/index.html"),
              );
              expect(instance.getFilenameFromUrl("/svg.svg")).toBe(
                path.join(webpackConfig.output.path, "/svg.svg"),
              );
              expect(
                instance.getFilenameFromUrl("/unknown.unknown"),
              ).toBeUndefined();
              expect(
                instance.getFilenameFromUrl("/unknown/unknown.unknown"),
              ).toBeUndefined();

              done();
            });
          });
        });

        describe('should work when the "index" option disabled', () => {
          beforeEach(async () => {
            compiler = getCompiler(webpackConfig);

            [server, req, instance] = await frameworkFactory(
              name,
              framework,
              compiler,
              {
                index: false,
              },
            );
          });

          afterEach(async () => {
            await close(server, instance);
          });

          it("should work", (done) => {
            instance.waitUntilValid(() => {
              expect(instance.getFilenameFromUrl("/bundle.js")).toBe(
                path.join(webpackConfig.output.path, "/bundle.js"),
              );
              // eslint-disable-next-line no-undefined
              expect(instance.getFilenameFromUrl("/")).toBe(undefined);
              expect(instance.getFilenameFromUrl("/index.html")).toBe(
                path.join(webpackConfig.output.path, "/index.html"),
              );
              expect(instance.getFilenameFromUrl("/svg.svg")).toBe(
                path.join(webpackConfig.output.path, "/svg.svg"),
              );
              expect(
                instance.getFilenameFromUrl("/unknown.unknown"),
              ).toBeUndefined();
              expect(
                instance.getFilenameFromUrl("/unknown/unknown.unknown"),
              ).toBeUndefined();

              done();
            });
          });
        });

        describe('should work with the "publicPath"', () => {
          beforeEach(async () => {
            compiler = getCompiler(webpackPublicPathConfig);

            [server, req, instance] = await frameworkFactory(
              name,
              framework,
              compiler,
            );
          });

          afterEach(async () => {
            await close(server, instance);
          });

          it("should work", (done) => {
            instance.waitUntilValid(() => {
              expect(
                instance.getFilenameFromUrl("/public/path/bundle.js"),
              ).toBe(
                path.join(webpackPublicPathConfig.output.path, "/bundle.js"),
              );
              expect(instance.getFilenameFromUrl("/public/path/")).toBe(
                path.join(webpackPublicPathConfig.output.path, "/index.html"),
              );
              expect(
                instance.getFilenameFromUrl("/public/path/index.html"),
              ).toBe(
                path.join(webpackPublicPathConfig.output.path, "/index.html"),
              );
              expect(instance.getFilenameFromUrl("/public/path/svg.svg")).toBe(
                path.join(webpackPublicPathConfig.output.path, "/svg.svg"),
              );

              expect(instance.getFilenameFromUrl("/")).toBeUndefined();
              expect(
                instance.getFilenameFromUrl("/unknown.unknown"),
              ).toBeUndefined();
              expect(
                instance.getFilenameFromUrl("/unknown/unknown.unknown"),
              ).toBeUndefined();

              done();
            });
          });
        });

        describe("should work in multi compiler mode", () => {
          beforeEach(async () => {
            compiler = getCompiler(webpackMultiConfig);

            [server, req, instance] = await frameworkFactory(
              name,
              framework,
              compiler,
            );
          });

          afterEach(async () => {
            await close(server, instance);
          });

          it("should work", (done) => {
            instance.waitUntilValid(() => {
              expect(instance.getFilenameFromUrl("/static-one/bundle.js")).toBe(
                path.join(webpackMultiConfig[0].output.path, "/bundle.js"),
              );
              expect(instance.getFilenameFromUrl("/static-one/")).toBe(
                path.join(webpackMultiConfig[0].output.path, "/index.html"),
              );
              expect(
                instance.getFilenameFromUrl("/static-one/index.html"),
              ).toBe(
                path.join(webpackMultiConfig[0].output.path, "/index.html"),
              );
              expect(instance.getFilenameFromUrl("/static-one/svg.svg")).toBe(
                path.join(webpackMultiConfig[0].output.path, "/svg.svg"),
              );
              expect(
                instance.getFilenameFromUrl("/static-one/unknown.unknown"),
              ).toBeUndefined();
              expect(
                instance.getFilenameFromUrl(
                  "/static-one/unknown/unknown.unknown",
                ),
              ).toBeUndefined();

              expect(instance.getFilenameFromUrl("/static-two/bundle.js")).toBe(
                path.join(webpackMultiConfig[1].output.path, "/bundle.js"),
              );
              expect(
                instance.getFilenameFromUrl("/static-two/unknown.unknown"),
              ).toBeUndefined();
              expect(
                instance.getFilenameFromUrl(
                  "/static-two/unknown/unknown.unknown",
                ),
              ).toBeUndefined();

              expect(instance.getFilenameFromUrl("/")).toBeUndefined();
              expect(
                instance.getFilenameFromUrl("/static-one/unknown.unknown"),
              ).toBeUndefined();
              expect(
                instance.getFilenameFromUrl(
                  "/static-one/unknown/unknown.unknown",
                ),
              ).toBeUndefined();

              done();
            });
          });
        });
      });

      describe("close method", () => {
        beforeEach(async () => {
          compiler = getCompiler(webpackConfig);

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
          );
        });

        afterEach(async () => {
          await close(server, instance);
        });

        it("should work without callback", (done) => {
          const doneSpy = jest.spyOn(getCompilerHooks(compiler).done[0], "fn");

          instance.waitUntilValid(() => {
            instance.close();

            expect(compiler.running).toBe(false);
            expect(doneSpy).toHaveBeenCalledTimes(1);

            doneSpy.mockRestore();

            done();
          });
        });

        it("should work with callback", (done) => {
          const doneSpy = jest.spyOn(getCompilerHooks(compiler).done[0], "fn");

          instance.waitUntilValid(() => {
            instance.close(() => {
              expect(compiler.running).toBe(false);
              expect(doneSpy).toHaveBeenCalledTimes(1);

              doneSpy.mockRestore();

              done();
            });
          });
        });
      });

      describe("context property", () => {
        beforeEach(async () => {
          compiler = getCompiler(webpackConfig);

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
          );
        });

        afterEach(async () => {
          await close(server, instance);
        });

        it("should contain public properties", (done) => {
          expect(instance.context.state).toBeDefined();
          expect(instance.context.options).toBeDefined();
          expect(instance.context.compiler).toBeDefined();
          expect(instance.context.watching).toBeDefined();
          expect(instance.context.outputFileSystem).toBeDefined();

          // the compilation needs to finish, as it will still be running
          // after the test is done if not finished, potentially impacting other tests
          compiler.hooks.done.tap("wdm-test", () => {
            done();
          });
        });
      });
    });

    describe("basic", () => {
      describe("should work", () => {
        let compiler;
        let codeContent;

        const outputPath = path.resolve(__dirname, "./outputs/basic-test");

        beforeAll(async () => {
          compiler = getCompiler({
            ...webpackConfig,
            output: {
              filename: "bundle.js",
              path: outputPath,
            },
          });
          compiler.hooks.afterCompile.tap("wdm-test", (params) => {
            codeContent = params.assets["bundle.js"].source();
          });

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
          );

          instance.context.outputFileSystem.mkdirSync(outputPath, {
            recursive: true,
          });
          instance.context.outputFileSystem.writeFileSync(
            path.resolve(outputPath, "image.svg"),
            "svg image",
          );
          instance.context.outputFileSystem.writeFileSync(
            path.resolve(outputPath, "image image.svg"),
            "svg image",
          );
          instance.context.outputFileSystem.writeFileSync(
            path.resolve(outputPath, "byte-length.html"),
            "\u00bd + \u00bc = \u00be",
          );
          instance.context.outputFileSystem.mkdirSync(
            path.resolve(outputPath, "directory/nested-directory"),
            { recursive: true },
          );
          instance.context.outputFileSystem.writeFileSync(
            path.resolve(outputPath, "directory/nested-directory/index.html"),
            "My Index.",
          );
          instance.context.outputFileSystem.writeFileSync(
            path.resolve(outputPath, "throw-an-exception-on-readFileSync.txt"),
            "exception",
          );
          instance.context.outputFileSystem.writeFileSync(
            path.resolve(outputPath, "unknown"),
            "unknown",
          );

          instance.context.outputFileSystem.writeFileSync(
            path.resolve(outputPath, "empty-file.txt"),
            "",
          );
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it("should not find the bundle file on disk", async () => {
          const response = await req.get("/bundle.js");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/javascript; charset=utf-8",
          );
          expect(fs.existsSync(path.resolve(outputPath, "bundle.js"))).toBe(
            false,
          );
        });

        it('should return the "200" code for the "GET" request to the bundle file', async () => {
          const response = await req.get("/bundle.js");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-length"]).toEqual(
            String(Buffer.byteLength(codeContent)),
          );
          expect(response.headers["content-type"]).toEqual(
            "text/javascript; charset=utf-8",
          );
          expect(response.text).toEqual(codeContent);
        });

        it('should return the "200" code for the "HEAD" request to the bundle file', async () => {
          const response = await req.head("/bundle.js");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-length"]).toEqual(
            String(Buffer.byteLength(codeContent)),
          );
          expect(response.headers["content-type"]).toEqual(
            "text/javascript; charset=utf-8",
          );
          expect(response.text).toBeUndefined();
        });

        it('should return the "404" code for the "POST" request to the bundle file', async () => {
          const response = await req.post("/bundle.js");

          expect(response.statusCode).toEqual(404);
        });

        it('should return the "200" code for the "GET" request to the "image.svg" file', async () => {
          const fileData = instance.context.outputFileSystem.readFileSync(
            path.resolve(outputPath, "image.svg"),
          );

          const response = await req.get("/image.svg");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-length"]).toEqual(
            fileData.byteLength.toString(),
          );
          expect(response.headers["content-type"]).toEqual("image/svg+xml");
        });

        it('should return the "200" code for the "GET" request to the "image.svg" file with "/../"', async () => {
          const fileData = instance.context.outputFileSystem.readFileSync(
            path.resolve(outputPath, "image.svg"),
          );

          const response = await req.get("/public/../image.svg");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-length"]).toEqual(
            fileData.byteLength.toString(),
          );
          expect(response.headers["content-type"]).toEqual("image/svg+xml");
        });

        it('should return the "200" code for the "GET" request to the "image.svg" file with "/../../../"', async () => {
          const fileData = instance.context.outputFileSystem.readFileSync(
            path.resolve(outputPath, "image.svg"),
          );

          const response = await req.get(
            "/public/assets/images/../../../image.svg",
          );

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-length"]).toEqual(
            fileData.byteLength.toString(),
          );
          expect(response.headers["content-type"]).toEqual("image/svg+xml");
        });

        it('should return the "200" code for the "GET" request to the directory', async () => {
          const fileData = fs.readFileSync(
            path.resolve(__dirname, "./fixtures/index.html"),
          );

          const response = await req.get("/");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-length"]).toEqual(
            fileData.byteLength.toString(),
          );
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
          expect(response.text).toEqual(fileData.toString());
        });

        it('should return the "200" code for the "GET" request to the subdirectory with "index.html"', async () => {
          const fileData = instance.context.outputFileSystem.readFileSync(
            path.resolve(outputPath, "directory/nested-directory/index.html"),
          );

          const response = await req.get("/directory/nested-directory/");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-length"]).toEqual(
            fileData.byteLength.toString(),
          );
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
          expect(response.text).toEqual(fileData.toString());
        });

        it('should return the "200" code for the "GET" request to the subdirectory with "index.html" without trailing slash', async () => {
          const fileData = instance.context.outputFileSystem.readFileSync(
            path.resolve(outputPath, "directory/nested-directory/index.html"),
          );

          const response = await req.get("/directory/nested-directory");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-length"]).toEqual(
            fileData.byteLength.toString(),
          );
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
          expect(response.text).toEqual(fileData.toString());
        });

        it('should return the "200" code for the "GET" request to the subdirectory with "index.html"', async () => {
          const fileData = instance.context.outputFileSystem.readFileSync(
            path.resolve(outputPath, "directory/nested-directory/index.html"),
          );

          const response = await req.get(
            "/directory/nested-directory/index.html",
          );

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-length"]).toEqual(
            fileData.byteLength.toString(),
          );
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
          expect(response.text).toEqual(fileData.toString());
        });

        it('should return the "416" code for the "GET" request with the invalid range header', async () => {
          const response = await req
            .get("/bundle.js")
            .set("Range", "bytes=9999999-");

          expect(response.statusCode).toEqual(416);
          expect(response.headers["content-range"]).toEqual(
            `bytes */${Buffer.byteLength(codeContent)}`,
          );
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
          expect(response.text).toEqual(
            `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>Range Not Satisfiable</pre>
</body>
</html>`,
          );
        });

        it('should return the "206" code for the "GET" request with the valid range header', async () => {
          const response = await req
            .get("/bundle.js")
            .set("Range", "bytes=3000-3500");

          expect(response.statusCode).toEqual(206);
          expect(response.headers["content-range"]).toEqual(
            `bytes 3000-3500/${Buffer.byteLength(codeContent)}`,
          );
          expect(response.headers["content-length"]).toEqual("501");
          expect(response.headers["content-type"]).toEqual(
            "text/javascript; charset=utf-8",
          );
          expect(response.text).toBe(codeContent.slice(3000, 3501));
          expect(response.text.length).toBe(501);
        });

        it('should return the "206" code for the "HEAD" request with the valid range header', async () => {
          const response = await req
            .head("/bundle.js")
            .set("Range", "bytes=3000-3500");

          expect(response.statusCode).toEqual(206);
          expect(response.headers["content-range"]).toEqual(
            `bytes 3000-3500/${Buffer.byteLength(codeContent)}`,
          );
          expect(response.headers["content-length"]).toEqual("501");
          expect(response.headers["content-type"]).toEqual(
            "text/javascript; charset=utf-8",
          );
          expect(response.text).toBeUndefined();
        });

        it('should return the "206" code for the "GET" request with the valid range header (lowercase)', async () => {
          const response = await req
            .get("/bundle.js")
            .set("range", "bytes=3000-3500");

          expect(response.statusCode).toEqual(206);
          expect(response.headers["content-range"]).toEqual(
            `bytes 3000-3500/${Buffer.byteLength(codeContent)}`,
          );
          expect(response.headers["content-length"]).toEqual("501");
          expect(response.headers["content-type"]).toEqual(
            "text/javascript; charset=utf-8",
          );
          expect(response.text).toBe(codeContent.slice(3000, 3501));
          expect(response.text.length).toBe(501);
        });

        it('should return the "206" code for the "GET" request with the valid range header (uppercase)', async () => {
          const response = await req
            .get("/bundle.js")
            .set("RANGE", "BYTES=3000-3500");

          expect(response.statusCode).toEqual(206);
          expect(response.headers["content-range"]).toEqual(
            `bytes 3000-3500/${Buffer.byteLength(codeContent)}`,
          );
          expect(response.headers["content-length"]).toEqual("501");
          expect(response.headers["content-type"]).toEqual(
            "text/javascript; charset=utf-8",
          );
          expect(response.text).toBe(codeContent.slice(3000, 3501));
          expect(response.text.length).toBe(501);
        });

        it('should return the "206" code for the "GET" request with the valid range header when range starts with 0', async () => {
          const response = await req
            .get("/bundle.js")
            .set("Range", "bytes=0-3500");

          expect(response.statusCode).toEqual(206);
          expect(response.headers["content-range"]).toEqual(
            `bytes 0-3500/${Buffer.byteLength(codeContent)}`,
          );
          expect(response.headers["content-length"]).toEqual("3501");
          expect(response.headers["content-type"]).toEqual(
            "text/javascript; charset=utf-8",
          );
          expect(response.text).toBe(codeContent.slice(0, 3501));
          expect(response.text.length).toBe(3501);
        });

        it('should return the "206" code for the "GET" request with the valid range header with multiple values', async () => {
          const response = await req
            .get("/bundle.js")
            .set("Range", "bytes=0-499, 499-800");

          expect(response.statusCode).toEqual(206);
          expect(response.headers["content-range"]).toEqual(
            `bytes 0-800/${Buffer.byteLength(codeContent)}`,
          );
          expect(response.headers["content-length"]).toEqual("801");
          expect(response.headers["content-type"]).toEqual(
            "text/javascript; charset=utf-8",
          );
          expect(response.text).toBe(codeContent.slice(0, 801));
          expect(response.text.length).toBe(801);
        });

        it('should return the "200" code for the "GET" request with malformed range header which is ignored', async () => {
          const response = await req.get("/bundle.js").set("Range", "abc");

          expect(response.statusCode).toEqual(200);
        });

        it('should return the "200" code for the "GET" request with malformed range header which is ignored #2', async () => {
          const response = await req.get("/bundle.js").set("Range", "bytes");

          expect(response.statusCode).toEqual(200);
        });

        it('should return the "200" code for the "GET" request with multiple range header which is ignored', async () => {
          const response = await req
            .get("/bundle.js")
            .set("Range", "bytes=3000-3100,3200-3300");

          expect(response.statusCode).toEqual(200);
        });

        it('should return the "404" code for the "GET" request with to the non-public path', async () => {
          const response = await req.get("/nonpublic/");

          expect(response.statusCode).toEqual(404);
        });

        it('should return the "404" code for the "GET" request to the deleted file', async () => {
          const spy = jest
            .spyOn(instance.context.outputFileSystem, "readFileSync")
            .mockImplementation(() => {
              throw new Error("error");
            });

          const response = await req.get(
            "/public/throw-an-exception-on-readFileSync.txt/",
          );

          expect(response.statusCode).toEqual(404);

          spy.mockRestore();
        });

        it('should return "200" code code for the "GET" request to the file without extension', async () => {
          const fileData = instance.context.outputFileSystem.readFileSync(
            path.resolve(outputPath, "unknown"),
          );

          const response = await req.get("/unknown");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-length"]).toEqual(
            fileData.byteLength.toString(),
          );
        });

        it('should return "200" code for the "GET" request and "Content-Length" to the file with unicode', async () => {
          const response = await req.get("/byte-length.html");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-length"]).toEqual("12");
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
          expect(fs.existsSync(path.resolve(outputPath, "bundle.js"))).toBe(
            false,
          );
        });

        it('should return "200" code for the "GET" request and "Content-Length" of "0" when file is empty', async () => {
          const response = await req.get("/empty-file.txt");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-length"]).toEqual("0");
          expect(response.headers["content-type"]).toEqual(
            "text/plain; charset=utf-8",
          );
        });

        it('should return the "200" code for the "GET" request to the "image image.svg" file', async () => {
          const fileData = instance.context.outputFileSystem.readFileSync(
            path.resolve(outputPath, "image image.svg"),
          );

          const response = await req.get("/image image.svg");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-length"]).toEqual(
            fileData.byteLength.toString(),
          );
          expect(response.headers["content-type"]).toEqual("image/svg+xml");
        });

        it('should return the "404" code for the "GET" request to the "%FF" file', async () => {
          const response = await req.get("/%FF");

          expect(response.statusCode).toEqual(404);
          expect(response.headers["content-type"]).toEqual(
            get404ContentTypeHeader(name),
          );
        });
      });

      describe('should not work with the broken "publicPath" option', () => {
        let compiler;

        const outputPath = path.resolve(__dirname, "./outputs/basic");

        beforeAll(async () => {
          compiler = getCompiler({
            ...webpackConfig,
            output: {
              filename: "bundle.js",
              path: outputPath,
              publicPath: "https://test:malfor%5Med@test.example.com",
            },
          });

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
          );
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it('should return the "400" code for the "GET" request to the bundle file', async () => {
          const response = await req.get("/bundle.js");

          expect(response.statusCode).toEqual(404);
        });
      });

      describe("should work in multi-compiler mode", () => {
        beforeAll(async () => {
          const compiler = getCompiler(webpackMultiConfig);

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
          );
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it('should return "200" code for GET request to the bundle file for the first compiler', async () => {
          const response = await req.get("/static-one/bundle.js");

          expect(response.statusCode).toEqual(200);
        });

        it('should return "404" code for GET request to a non existing file for the first compiler', async () => {
          const response = await req.get("/static-one/invalid.js");

          expect(response.statusCode).toEqual(404);
        });

        it('should return "200" code for GET request to the "public" path for the first compiler', async () => {
          const response = await req.get("/static-one/");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });

        it('should return "200" code for GET request to the "index" option for the first compiler', async () => {
          const response = await req.get("/static-one/index.html");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });

        it('should return "200" code for GET request for the bundle file for the second compiler', async () => {
          const response = await req.get("/static-two/bundle.js");

          expect(response.statusCode).toEqual(200);
        });

        it('should return "404" code for GET request to a non existing file for the second compiler', async () => {
          const response = await req.get("/static-two/invalid.js");

          expect(response.statusCode).toEqual(404);
        });

        it('should return "404" code for GET request to the "public" path for the second compiler', async () => {
          const response = await req.get("/static-two/");

          expect(response.statusCode).toEqual(404);
        });

        it('should return "404" code for GET request to the "index" option for the second compiler', async () => {
          const response = await req.get("/static-two/index.html");

          expect(response.statusCode).toEqual(404);
        });

        it('should return "404" code for GET request to the non-public path', async () => {
          const response = await req.get("/static-three/");

          expect(response.statusCode).toEqual(404);
          expect(response.headers["content-type"]).toEqual(
            get404ContentTypeHeader(name),
          );
        });

        it('should return "404" code for GET request to the non-public path', async () => {
          const response = await req.get("/static-three/invalid.js");

          expect(response.statusCode).toEqual(404);
          expect(response.headers["content-type"]).toEqual(
            get404ContentTypeHeader(name),
          );
        });

        it('should return "404" code for GET request to the non-public path', async () => {
          const response = await req.get("/");

          expect(response.statusCode).toEqual(404);
          expect(response.headers["content-type"]).toEqual(
            get404ContentTypeHeader(name),
          );
        });
      });

      describe("should work with difference requests", () => {
        const basicOutputPath = path.resolve(__dirname, "./outputs/basic");
        const fixtures = [
          {
            urls: [
              {
                value: "bundle.js",
                contentType: "text/javascript; charset=utf-8",
                code: 200,
              },
              {
                value: "",
                contentType: "text/html; charset=utf-8",
                code: 200,
              },
              {
                value: "index.html",
                contentType: "text/html; charset=utf-8",
                code: 200,
              },
              {
                value: "invalid.js",
                contentType: get404ContentTypeHeader(name),
                code: 404,
              },
              {
                value: "complex",
                contentType: get404ContentTypeHeader(name),
                code: 404,
              },
              {
                value: "complex/invalid.js",
                contentType: get404ContentTypeHeader(name),
                code: 404,
              },
              {
                value: "complex/complex",
                contentType: get404ContentTypeHeader(name),
                code: 404,
              },
              {
                value: "complex/complex/invalid.js",
                contentType: get404ContentTypeHeader(name),
                code: 404,
              },
              {
                value: "%",
                contentType: get404ContentTypeHeader(name),
                code: 404,
              },
            ],
          },
          {
            file: "config.json",
            data: JSON.stringify({ foo: "bar" }),
            urls: [
              {
                value: "config.json",
                contentType: "application/json; charset=utf-8",
                code: 200,
              },
            ],
          },
          {
            file: "image.svg",
            data: "<svg>SVG</svg>",
            urls: [
              {
                value: "image.svg",
                contentType: "image/svg+xml",
                code: 200,
              },
            ],
          },
          {
            file: "foo.js",
            data: 'console.log("foo");',
            urls: [
              {
                value: "foo.js",
                contentType: "text/javascript; charset=utf-8",
                code: 200,
              },
            ],
          },
          {
            file: "/complex/foo.js",
            data: 'console.log("foo");',
            urls: [
              {
                value: "complex/foo.js",
                contentType: "text/javascript; charset=utf-8",
                code: 200,
              },
              {
                value: "complex/./foo.js",
                contentType: "text/javascript; charset=utf-8",
                code: 200,
              },
              {
                value: "complex/foo/../foo.js",
                contentType: "text/javascript; charset=utf-8",
                code: 200,
              },
            ],
          },
          {
            file: "/complex/complex/foo.js",
            data: 'console.log("foo");',
            urls: [
              {
                value: "complex/complex/foo.js",
                contentType: "text/javascript; charset=utf-8",
                code: 200,
              },
            ],
          },
          {
            file: "/föö.js",
            data: 'console.log("foo");',
            urls: [
              // Express encodes the URI component, so we do the same
              {
                value: "f%C3%B6%C3%B6.js",
                contentType: "text/javascript; charset=utf-8",
                code: 200,
              },
            ],
          },
          {
            file: "/%foo%/%foo%.js",
            data: 'console.log("foo");',
            urls: [
              // Filenames can contain characters not allowed in URIs
              {
                value: "%foo%/%foo%.js",
                contentType: "text/javascript; charset=utf-8",
                code: 200,
              },
            ],
          },
          {
            file: "test.html",
            data: "<div>test</div>",
            urls: [
              {
                value: "test.html?foo=bar",
                contentType: "text/html; charset=utf-8",
                code: 200,
              },
              {
                value: "test.html?foo=bar#hash",
                contentType: "text/html; charset=utf-8",
                code: 200,
              },
            ],
          },
          {
            file: "pathname with spaces.js",
            data: 'console.log("foo");',
            urls: [
              {
                value: "pathname%20with%20spaces.js",
                contentType: "text/javascript; charset=utf-8",
                code: 200,
              },
            ],
          },
          {
            file: "dirname with spaces/filename with spaces.js",
            data: 'console.log("foo");',
            urls: [
              {
                value: "dirname%20with%20spaces/filename%20with%20spaces.js",
                contentType: "text/javascript; charset=utf-8",
                code: 200,
              },
            ],
          },
          {
            file: "filename-name-with-dots/mono-v6.x.x",
            data: "content with .",
            urls: [
              {
                value: "filename-name-with-dots/mono-v6.x.x",
                code: 200,
              },
            ],
          },
          {
            file: "noextension",
            data: "noextension content",
            urls: [
              {
                value: "noextension",
                code: 200,
              },
            ],
          },
          {
            file: "hello.wasm",
            data: "hello.wasm content",
            urls: [
              {
                value: "hello.wasm",
                contentType: "application/wasm",
                code: 200,
              },
            ],
          },
          {
            file: "windows.txt",
            data: "windows.txt content",
            urls: [
              {
                value: "windows.txt",
                contentType: "text/plain; charset=utf-8",
                code: 200,
              },
            ],
          },
          {
            file: "windows 2.txt",
            data: "windows 2.txt content",
            urls: [
              {
                value: "windows%202.txt",
                contentType: "text/plain; charset=utf-8",
                code: 200,
              },
            ],
          },
          {
            file: "test & test & %20.txt",
            data: "test & test & %20.txt content",
            urls: [
              {
                value: "test%20%26%20test%20%26%20%2520.txt",
                contentType: "text/plain; charset=utf-8",
                code: 200,
              },
            ],
          },
        ];

        const configurations = [
          {
            output: { path: basicOutputPath, publicPath: "" },
            publicPathForRequest: "/",
          },
          {
            output: {
              path: path.join(basicOutputPath, "dist"),
              publicPath: "",
            },
            publicPathForRequest: "/",
          },
          {
            output: { path: basicOutputPath, publicPath: "/" },
            publicPathForRequest: "/",
          },
          {
            output: {
              path: path.join(basicOutputPath, "dist"),
              publicPath: "/",
            },
            publicPathForRequest: "/",
          },
          {
            output: { path: basicOutputPath, publicPath: "/static" },
            publicPathForRequest: "/static/",
          },
          {
            output: {
              path: path.join(basicOutputPath, "dist"),
              publicPath: "/static",
            },
            publicPathForRequest: "/static/",
          },
          {
            output: { path: basicOutputPath, publicPath: "/static/" },
            publicPathForRequest: "/static/",
          },
          {
            output: {
              path: path.join(basicOutputPath, "dist"),
              publicPath: "/static/",
            },
            publicPathForRequest: "/static/",
          },
          {
            output: {
              path: path.join(basicOutputPath, "dist/#leadinghash"),
              publicPath: "/",
            },
            publicPathForRequest: "/",
          },
          {
            output: {
              path: basicOutputPath,
              publicPath: "http://127.0.0.1/",
            },
            publicPathForRequest: "/",
          },
          {
            output: {
              path: basicOutputPath,
              publicPath: "http://127.0.0.1:3000/",
            },
            publicPathForRequest: "/",
          },
          {
            output: {
              path: basicOutputPath,
              publicPath: "//test.domain/",
            },
            publicPathForRequest: "/",
          },
          {
            output: {
              path: path.join(basicOutputPath, "my static"),
              publicPath: "/static/",
            },
            publicPathForRequest: "/static/",
          },
          {
            output: {
              path: path.join(basicOutputPath, "my%20static"),
              publicPath: "/static/",
            },
            publicPathForRequest: "/static/",
          },
          {
            output: {
              path: path.join(basicOutputPath, "my %20 static"),
              publicPath: "/my%20static/",
            },
            publicPathForRequest: "/my%20static/",
          },
        ];

        for (const configuration of configurations) {
          // eslint-disable-next-line no-loop-func
          describe("should work handle requests", () => {
            const { output, publicPathForRequest } = configuration;
            const { path: outputPath, publicPath } = output;

            let compiler;

            beforeAll(async () => {
              compiler = getCompiler({
                ...webpackConfig,
                output: {
                  filename: "bundle.js",
                  path: outputPath,
                  publicPath,
                },
              });

              [server, req, instance] = await frameworkFactory(
                name,
                framework,
                compiler,
              );

              const {
                context: {
                  outputFileSystem: { mkdirSync, writeFileSync },
                },
              } = instance;

              for (const { file, data } of fixtures) {
                if (file) {
                  const fullPath = path.join(outputPath, file);

                  mkdirSync(path.dirname(fullPath), { recursive: true });
                  writeFileSync(fullPath, data);
                }
              }
            });

            afterAll(async () => {
              await close(server, instance);
            });

            for (const { data, urls } of fixtures) {
              for (const { value, contentType, code } of urls) {
                // eslint-disable-next-line no-loop-func
                it(`should return the "${code}" code for the "GET" request for the "${value}" url`, async () => {
                  const response = await req.get(
                    `${publicPathForRequest}${value}`,
                  );

                  expect(response.statusCode).toEqual(code);

                  if (data) {
                    expect(response.headers["content-length"]).toEqual(
                      String(data.length),
                    );
                  }

                  if (contentType) {
                    expect(response.headers["content-type"]).toEqual(
                      contentType,
                    );
                  }
                });
              }
            }
          });
        }
      });

      describe('should respect the value of the "Content-Type" header from other middleware', () => {
        beforeAll(async () => {
          const compiler = getCompiler(webpackConfig);

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
            // eslint-disable-next-line no-undefined
            undefined,
            {
              setupMiddlewares: (middlewares) => {
                middlewares.unshift((_req, res, next) => {
                  // Express API
                  if (res.set) {
                    res.set(
                      "Content-Type",
                      "application/vnd.test+octet-stream",
                    );
                  }
                  // Connect API
                  else {
                    res.setHeader(
                      "Content-Type",
                      "application/vnd.test+octet-stream",
                    );
                  }

                  next();
                });

                return middlewares;
              },
            },
          );
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it('should not modify the "Content-Type" header', async () => {
          const response = await req.get("/bundle.js");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "application/vnd.test+octet-stream",
          );
        });
      });

      describe('should work without "output" options', () => {
        beforeAll(async () => {
          // eslint-disable-next-line no-undefined
          const compiler = getCompiler({ ...webpackConfig, output: undefined });

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
          );
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it('should return "200" code for GET request to the bundle file', async () => {
          const response = await req.get("/main.js");

          expect(response.statusCode).toEqual(200);
        });

        it('should return "404" code for GET request to a nonexistent file', async () => {
          const response = await req.get("/invalid.js");

          expect(response.statusCode).toEqual(404);
        });

        it('should return "200" code for GET request to the non-public path', async () => {
          const response = await req.get("/");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });

        it('should return "200" code for GET request to the "index" option', async () => {
          const response = await req.get("/index.html");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });
      });

      describe('should work with trailing slash at the end of the "option.path" option', () => {
        beforeAll(async () => {
          const compiler = getCompiler({
            ...webpackConfig,
            output: {
              filename: "bundle.js",
              path: path.resolve(__dirname, "./outputs/basic/"),
            },
          });

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
          );
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it('should return "200" code for GET request to the bundle file', async () => {
          const response = await req.get("/bundle.js");

          expect(response.statusCode).toEqual(200);
        });

        it('should return "404" code for GET request to a nonexistent file', async () => {
          const response = await req.get("/invalid.js");

          expect(response.statusCode).toEqual(404);
        });

        it('should return "200" code for GET request to the non-public path', async () => {
          const response = await req.get("/");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });

        it('should return "200" code for GET request to the "index" option', async () => {
          const response = await req.get("/index.html");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });
      });

      describe('should respect empty "output.publicPath" and "output.path" options', () => {
        beforeAll(async () => {
          const compiler = getCompiler(webpackConfig);

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
          );
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it('should return "200" code for GET request to the bundle file', async () => {
          const response = await req.get("/bundle.js");

          expect(response.statusCode).toEqual(200);
        });

        it('should return "404" code for GET request to a nonexistent file', async () => {
          const response = await req.get("/invalid.js");

          expect(response.statusCode).toEqual(404);
        });

        it('should return "200" code for GET request to the non-public path', async () => {
          const response = await req.get("/");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });

        it('should return "200" code for GET request to the "index" option', async () => {
          const response = await req.get("/index.html");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });
      });

      describe('should respect "output.publicPath" and "output.path" options', () => {
        beforeAll(async () => {
          const compiler = getCompiler({
            ...webpackConfig,
            output: {
              filename: "bundle.js",
              publicPath: "/static/",
              path: path.resolve(__dirname, "./outputs/other-basic"),
            },
          });

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
          );
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it('should return "200" code for GET request to the bundle file', async () => {
          const response = await req.get("/static/bundle.js");

          expect(response.statusCode).toEqual(200);
        });

        it('should return "404" code for GET request to a nonexistent file', async () => {
          const response = await req.get("/static/invalid.js");

          expect(response.statusCode).toEqual(404);
        });

        it('should return "200" code for GET request to the public path', async () => {
          const response = await req.get("/static/");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });

        it('should return "200" code for GET request to the "index" option', async () => {
          const response = await req.get("/static/index.html");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });

        it('should return "404" code for GET request to the non-public path', async () => {
          const response = await req.get("/");

          expect(response.statusCode).toEqual(404);
          expect(response.headers["content-type"]).toEqual(
            get404ContentTypeHeader(name),
          );
        });
      });

      describe('should respect "output.publicPath" and "output.path" options with hash substitutions', () => {
        let hash;

        beforeAll(async () => {
          const compiler = getCompiler({
            ...webpackConfig,
            output: {
              filename: "bundle.js",
              publicPath: "/static/[fullhash]/",
              path: path.resolve(__dirname, "./outputs/other-basic-[fullhash]"),
            },
          });
          compiler.hooks.afterCompile.tap("wdm-test", ({ hash: h }) => {
            hash = h;
          });

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
          );

          await new Promise((resolve) => {
            const interval = setInterval(() => {
              if (hash) {
                clearInterval(interval);

                resolve();
              }
            }, 10);
          });
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it('should return "200" code for GET request to the bundle file', async () => {
          const response = await req.get(`/static/${hash}/bundle.js`);

          expect(response.statusCode).toEqual(200);
        });

        it('should return "404" code for GET request to a nonexistent file', async () => {
          const response = await req.get("/static/invalid.js");

          expect(response.statusCode).toEqual(404);
        });

        it('should return "200" code for GET request to the public path', async () => {
          const response = await req.get(`/static/${hash}/`);

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });

        it('should return "200" code for GET request to the "index" option', async () => {
          const response = await req.get(`/static/${hash}/index.html`);

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });

        it('should return "404" code for GET request to the non-public path', async () => {
          const response = await req.get("/");

          expect(response.statusCode).toEqual(404);
        });
      });

      describe('should respect "output.publicPath" and "output.path" options in multi-compiler mode with hash substitutions', () => {
        let hashOne;
        let hashTwo;

        beforeAll(async () => {
          const compiler = getCompiler([
            {
              ...webpackMultiConfig[0],
              output: {
                filename: "bundle.js",
                path: path.resolve(
                  __dirname,
                  "./outputs/array-[fullhash]/static-one",
                ),
                publicPath: "/static-one/[fullhash]/",
              },
            },
            {
              ...webpackMultiConfig[1],
              output: {
                filename: "bundle.js",
                path: path.resolve(
                  __dirname,
                  "./outputs/array-[fullhash]/static-two",
                ),
                publicPath: "/static-two/[fullhash]/",
              },
            },
          ]);
          compiler.hooks.done.tap("wdm-test", (stats) => {
            const [one, two] = stats.stats;

            hashOne = one.hash;
            hashTwo = two.hash;
          });

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
          );

          await new Promise((resolve) => {
            const interval = setInterval(() => {
              if (hashOne && hashTwo) {
                clearInterval(interval);

                resolve();
              }
            }, 10);
          });
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it('should return "200" code for GET request to the bundle file for the first compiler', async () => {
          const response = await req.get(`/static-one/${hashOne}/bundle.js`);

          expect(response.statusCode).toEqual(200);
        });

        it('should return "404" code for GET request to nonexistent file for the first compiler', async () => {
          const response = await req.get(`/static-one/${hashOne}/invalid.js`);

          expect(response.statusCode).toEqual(404);
        });

        it('should return "200" code for GET request for the second bundle file', async () => {
          const response = await req.get(`/static-one/${hashOne}/`);

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });

        it('should return "200" code for GET request to the "index" option for the first compiler', async () => {
          const response = await req.get(`/static-one/${hashOne}/index.html`);

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });

        it('should return "200" code for GET request to the bundle file for the second compiler', async () => {
          const response = await req.get(`/static-two/${hashTwo}/bundle.js`);

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/javascript; charset=utf-8",
          );
        });

        it('should return "404" code for GET request to nonexistent file for the second compiler', async () => {
          const response = await req.get(`/static-two/${hashTwo}/invalid.js`);

          expect(response.statusCode).toEqual(404);
          expect(response.headers["content-type"]).toEqual(
            get404ContentTypeHeader(name),
          );
        });

        it('should return "404" code for GET request to the "public" path for the second compiler', async () => {
          const response = await req.get(`/static-two/${hashTwo}/`);

          expect(response.statusCode).toEqual(404);
        });

        it('should return "404" code for GET request to the "index" option for the second compiler', async () => {
          const response = await req.get(`/static-two/${hashTwo}/index.html`);

          expect(response.statusCode).toEqual(404);
        });

        it('should return "404" code for GET request to non-public path', async () => {
          const response = await req.get("/");

          expect(response.statusCode).toEqual(404);
        });
      });

      describe('should respect "output.publicPath" and "output.path" options in multi-compiler mode with difference "publicPath" and "path"', () => {
        beforeAll(async () => {
          const compiler = getCompiler(webpackMultiConfig);

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
          );
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it('should return "200" code for GET request to the bundle file for the first compiler', async () => {
          const response = await req.get("/static-one/bundle.js");

          expect(response.statusCode).toEqual(200);
        });

        it('should return "404" code for GET request to nonexistent file for the first compiler', async () => {
          const response = await req.get("/static-one/invalid.js");

          expect(response.statusCode).toEqual(404);
        });

        it('should return "200" code for GET request to the "public" path for the first compiler', async () => {
          const response = await req.get("/static-one/");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });

        it('should return "200" code for GET request to the "index" option for the first compiler', async () => {
          const response = await req.get("/static-one/index.html");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });

        it('should return "200" code for GET request to the second bundle file', async () => {
          const response = await req.get("/static-two/bundle.js");

          expect(response.statusCode).toEqual(200);
        });

        it('should return "404" code for GET request to nonexistent file for the second compiler', async () => {
          const response = await req.get("/static-two/invalid.js");

          expect(response.statusCode).toEqual(404);
        });

        it('should return "200" code for GET request to the "public" path for the second compiler', async () => {
          const response = await req.get("/static-two/");

          expect(response.statusCode).toEqual(404);
        });

        it('should return "200" code for GET request to the "index" option for the second compiler', async () => {
          const response = await req.get("/static-two/index.html");

          expect(response.statusCode).toEqual(404);
        });

        it('should return "404" code for GET request to nonexistent file', async () => {
          const response = await req.get("/static/invalid.js");

          expect(response.statusCode).toEqual(404);
        });

        it('should return "404" code for GET request to non-public path', async () => {
          const response = await req.get("/");

          expect(response.statusCode).toEqual(404);
        });
      });

      describe('should respect "output.publicPath" and "output.path" options in multi-compiler mode with same "publicPath"', () => {
        beforeAll(async () => {
          const compiler = getCompiler([
            {
              ...webpackMultiConfig[0],
              output: {
                filename: "bundle-one.js",
                path: path.resolve(__dirname, "./outputs/array/static-one"),
                publicPath: "/my-public/",
              },
            },
            {
              ...webpackMultiConfig[1],
              output: {
                filename: "bundle-two.js",
                path: path.resolve(__dirname, "./outputs/array/static-two"),
                publicPath: "/my-public/",
              },
            },
          ]);

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
          );
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it('should return "200" code for GET request to the bundle file for the first compiler', async () => {
          const response = await req.get("/my-public/bundle-one.js");

          expect(response.statusCode).toEqual(200);
        });

        it('should return "200" code for GET request to the bundle file for the second compiler', async () => {
          const response = await req.get("/my-public/bundle-two.js");

          expect(response.statusCode).toEqual(200);
        });

        it('should return "404" code for GET request to nonexistent file', async () => {
          const response = await req.get("/my-public/invalid.js");

          expect(response.statusCode).toEqual(404);
        });

        it('should return "200" code for GET request to the "public" path', async () => {
          const response = await req.get("/my-public/");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });

        it('should return "200" code for GET request to the "index" option', async () => {
          const response = await req.get("/my-public/index.html");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });

        it('should return "404" code for GET request to nonexistent file', async () => {
          const response = await req.get("/static/invalid.js");

          expect(response.statusCode).toEqual(404);
        });

        it('should return "404" code for GET request to non-public path', async () => {
          const response = await req.get("/");

          expect(response.statusCode).toEqual(404);
        });
      });

      describe('should respect "output.publicPath" and "output.path" options in multi-compiler mode with same "path"', () => {
        beforeAll(async () => {
          const compiler = getCompiler([
            {
              ...webpackMultiConfig[0],
              output: {
                filename: "bundle-one.js",
                path: path.resolve(__dirname, "./outputs/array/static-one"),
                publicPath: "/one-public/",
              },
            },
            {
              ...webpackMultiConfig[1],
              output: {
                filename: "bundle-two.js",
                path: path.resolve(__dirname, "./outputs/array/static-one"),
                publicPath: "/two-public/",
              },
            },
          ]);

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
          );
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it('should return "200" code for GET request to the bundle file for the first compiler', async () => {
          const response = await req.get("/one-public/bundle-one.js");

          expect(response.statusCode).toEqual(200);
        });

        it('should return "404" code for GET request to nonexistent file to the first bundle file', async () => {
          const response = await req.get("/one-public/invalid.js");

          expect(response.statusCode).toEqual(404);
        });

        it('should return "200" code for GET request to the "public" path for the first compiler', async () => {
          const response = await req.get("/one-public/");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });

        it('should return "200" code for GET request to the "index" option for the first compiler', async () => {
          const response = await req.get("/one-public/index.html");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });

        it('should return "200" code for GET request to the bundle file for the second compiler', async () => {
          const response = await req.get("/two-public/bundle-two.js");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/javascript; charset=utf-8",
          );
        });

        it('should return "404" code for GET request to nonexistent file to the second bundle file', async () => {
          const response = await req.get("/two-public/invalid.js");

          expect(response.statusCode).toEqual(404);
        });

        it('should return "200" code for GET request to the "public" path for the second compiler', async () => {
          const response = await req.get("/two-public/");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });

        it('should return "200" code for GET request to the "index" option for the second compiler', async () => {
          const response = await req.get("/two-public/index.html");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });

        it('should return "404" code for GET request to nonexistent file', async () => {
          const response = await req.get("/static/invalid");

          expect(response.statusCode).toEqual(404);
        });

        it('should return "404" code for GET request to non-public path', async () => {
          const response = await req.get("/");

          expect(response.statusCode).toEqual(404);
        });
      });

      describe('should respect "output.publicPath" and "output.path" options in multi-compiler mode, when the "output.publicPath" option presented in only one configuration (in first)', () => {
        beforeAll(async () => {
          const compiler = getCompiler(webpackClientServerConfig);

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
          );
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it('should return "200" code for GET request to the bundle file', async () => {
          const response = await req.get("/static/bundle.js");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/javascript; charset=utf-8",
          );
        });

        it('should return "404" code for GET request to nonexistent file', async () => {
          const response = await req.get("/static/invalid.js");

          expect(response.statusCode).toEqual(404);
        });

        it('should return "404" code for GET request to the public path', async () => {
          const response = await req.get("/static/");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });

        it('should return "404" code for GET request to the "index" option', async () => {
          const response = await req.get("/static/index.html");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });

        it('should return "404" code for GET request to non-public path', async () => {
          const response = await req.get("/");

          expect(response.statusCode).toEqual(404);
        });
      });

      describe('should respect "output.publicPath" and "output.path" options in multi-compiler mode, when the "output.publicPath" option presented in only one configuration (in second)', () => {
        beforeAll(async () => {
          const compiler = getCompiler([
            webpackClientServerConfig[1],
            webpackClientServerConfig[0],
          ]);

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
          );
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it('should return "200" code for GET request to the bundle file', async () => {
          const response = await req.get("/static/bundle.js");

          expect(response.statusCode).toEqual(200);
        });

        it('should return "404" code for GET request to nonexistent file', async () => {
          const response = await req.get("/static/invalid.js");

          expect(response.statusCode).toEqual(404);
        });

        it('should return "404" code for GET request to the public path', async () => {
          const response = await req.get("/static/");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });

        it('should return "404" code for GET request to the "index" option', async () => {
          const response = await req.get("/static/index.html");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });

        it('should return "404" code for GET request to non-public path', async () => {
          const response = await req.get("/");

          expect(response.statusCode).toEqual(404);
        });
      });

      describe('should respect "output.publicPath" and "output.path" options in multi-compiler mode, when the "output.publicPath" option presented in only one configuration with same "path"', () => {
        beforeAll(async () => {
          const compiler = getCompiler([
            {
              ...webpackClientServerConfig[0],
              output: {
                filename: "bundle-one.js",
                path: path.resolve(__dirname, "./outputs/client-server/same"),
                publicPath: "/static/",
              },
            },
            {
              ...webpackClientServerConfig[1],
              output: {
                filename: "bundle-two.js",
                path: path.resolve(__dirname, "./outputs/client-server/same"),
              },
            },
          ]);

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
          );
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it('should return "200" code for GET request to the bundle file', async () => {
          const response = await req.get("/static/bundle-one.js");

          expect(response.statusCode).toEqual(200);
        });

        it('should return "404" code for GET request to a nonexistent file', async () => {
          const response = await req.get("/static/invalid.js");

          expect(response.statusCode).toEqual(404);
        });

        it('should return "404" code for GET request to the public path', async () => {
          const response = await req.get("/static/");

          expect(response.statusCode).toEqual(200);
        });

        it('should return "200" code for GET request to the non-public path', async () => {
          const response = await req.get("/");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });

        it('should return "404" code for GET request to the "index" option', async () => {
          const response = await req.get("/static/index.html");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });
      });

      describe("should handle an earlier request if a change happened while compiling", () => {
        beforeAll(async () => {
          const compiler = getCompiler(webpackConfig);

          let invalidated = false;

          compiler.hooks.afterDone.tap("Invalidated", () => {
            if (!invalidated) {
              instance.invalidate();

              invalidated = true;
            }
          });

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
          );
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it('should return the "200" code for the "GET" request to the bundle file', async () => {
          const response = await req.get("/bundle.js");

          expect(response.statusCode).toEqual(200);
        });
      });

      describe("should handle custom fs errors and response 500 code", () => {
        let compiler;

        const outputPath = path.resolve(
          __dirname,
          "./outputs/basic-test-errors-500",
        );

        beforeAll(async () => {
          compiler = getCompiler({
            ...webpackConfig,
            output: {
              filename: "bundle.js",
              path: outputPath,
            },
          });

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
          );

          instance.context.outputFileSystem.mkdirSync(outputPath, {
            recursive: true,
          });
          instance.context.outputFileSystem.writeFileSync(
            path.resolve(outputPath, "image.svg"),
            "svg image",
          );

          instance.context.outputFileSystem.createReadStream =
            function createReadStream(...args) {
              const brokenStream = new this.ReadStream(...args);

              // eslint-disable-next-line no-underscore-dangle
              brokenStream._read = function _read() {
                this.emit("error", new Error("test"));
                this.end();
                this.destroy();
              };

              return brokenStream;
            };
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it('should return the "500" code for the "GET" request to the "image.svg" file', async () => {
          const response = await req.get("/image.svg").set("Range", "bytes=0-");

          expect(response.statusCode).toEqual(500);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
          expect(response.text).toEqual(
            "<!DOCTYPE html>\n" +
              '<html lang="en">\n' +
              "<head>\n" +
              '<meta charset="utf-8">\n' +
              "<title>Error</title>\n" +
              "</head>\n" +
              "<body>\n" +
              "<pre>Internal Server Error</pre>\n" +
              "</body>\n" +
              "</html>",
          );
        });
      });

      describe("should handle known fs errors and response 404 code", () => {
        let compiler;

        const outputPath = path.resolve(
          __dirname,
          "./outputs/basic-test-errors-404",
        );

        beforeAll(async () => {
          compiler = getCompiler({
            ...webpackConfig,
            output: {
              filename: "bundle.js",
              path: outputPath,
            },
          });

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
          );

          instance.context.outputFileSystem.mkdirSync(outputPath, {
            recursive: true,
          });
          instance.context.outputFileSystem.writeFileSync(
            path.resolve(outputPath, "image.svg"),
            "svg image",
          );

          instance.context.outputFileSystem.createReadStream =
            function createReadStream(...args) {
              const brokenStream = new this.ReadStream(...args);

              // eslint-disable-next-line no-underscore-dangle
              brokenStream._read = function _read() {
                const error = new Error("test");

                error.code = "ENAMETOOLONG";

                this.emit("error", error);
                this.end();
                this.destroy();
              };

              return brokenStream;
            };
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it('should return the "404" code for the "GET" request to the "image.svg" file', async () => {
          const response = await req.get("/image.svg").set("Range", "bytes=0-");

          expect(response.statusCode).toEqual(404);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
          expect(response.text).toEqual(
            "<!DOCTYPE html>\n" +
              '<html lang="en">\n' +
              "<head>\n" +
              '<meta charset="utf-8">\n' +
              "<title>Error</title>\n" +
              "</head>\n" +
              "<body>\n" +
              "<pre>Not Found</pre>\n" +
              "</body>\n" +
              "</html>",
          );
        });
      });
    });

    describe("watchOptions option", () => {
      describe("should work without value", () => {
        let compiler;
        let spy;

        beforeAll(async () => {
          compiler = getCompiler(webpackConfig);
          spy = jest.spyOn(compiler, "watch");

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
          );
        });

        afterAll(async () => {
          spy.mockRestore();

          await close(server, instance);
        });

        it('should pass arguments to the "watch" method', async () => {
          const response = await req.get("/bundle.js");

          expect(response.statusCode).toEqual(200);
          expect(spy).toHaveBeenCalledTimes(1);
          expect(spy.mock.calls[0][0]).toEqual({});
        });
      });

      describe("should respect options from the configuration", () => {
        let compiler;
        let spy;

        beforeAll(async () => {
          compiler = getCompiler(webpackWatchOptionsConfig);

          spy = jest.spyOn(compiler, "watch");

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
          );
        });

        afterAll(async () => {
          spy.mockRestore();

          await close(server, instance);
        });

        it('should pass arguments to the "watch" method', async () => {
          const response = await req.get("/bundle.js");

          expect(response.statusCode).toEqual(200);
          expect(spy).toHaveBeenCalledTimes(1);
          expect(spy.mock.calls[0][0]).toEqual({
            aggregateTimeout: 300,
            poll: true,
          });
        });
      });

      describe("should respect options from the configuration in multi-compile mode", () => {
        let compiler;
        let spy;

        beforeAll(async () => {
          compiler = getCompiler(webpackMultiWatchOptionsConfig);

          spy = jest.spyOn(compiler, "watch");

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
          );
        });

        afterAll(async () => {
          spy.mockRestore();

          await close(server, instance);
        });

        it('should pass arguments to the "watch" method', async () => {
          const response1 = await req.get("/static-one/bundle.js");

          expect(response1.statusCode).toEqual(200);

          const response2 = await req.get("/static-two/bundle.js");

          expect(response2.statusCode).toEqual(200);
          expect(spy).toHaveBeenCalledTimes(1);
          expect(spy.mock.calls[0][0]).toEqual([
            { aggregateTimeout: 800, poll: false },
            { aggregateTimeout: 300, poll: true },
          ]);
        });
      });
    });

    describe("writeToDisk option", () => {
      describe('should work with "true" value', () => {
        let compiler;

        beforeAll(async () => {
          compiler = getCompiler({
            ...webpackConfig,
            output: {
              filename: "bundle.js",
              path: path.resolve(__dirname, "./outputs/write-to-disk-true"),
              publicPath: "/public/",
            },
          });

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
            { writeToDisk: true },
          );
        });

        afterAll(async () => {
          del.sync(
            path.posix.resolve(__dirname, "./outputs/write-to-disk-true"),
          );

          await close(server, instance);
        });

        it("should find the bundle file on disk", (done) => {
          req.get("/public/bundle.js").expect(200, (error) => {
            if (error) {
              return done(error);
            }

            const bundlePath = path.resolve(
              __dirname,
              "./outputs/write-to-disk-true/bundle.js",
            );

            expect(
              compiler.hooks.assetEmitted.taps.filter(
                (hook) => hook.name === "DevMiddleware",
              ).length,
            ).toBe(1);
            expect(fs.existsSync(bundlePath)).toBe(true);

            instance.invalidate();

            return compiler.hooks.done.tap(
              "DevMiddlewareWriteToDiskTest",
              () => {
                expect(
                  compiler.hooks.assetEmitted.taps.filter(
                    (hook) => hook.name === "DevMiddleware",
                  ).length,
                ).toBe(1);

                done();
              },
            );
          });
        });

        it("should not allow to get files above root", async () => {
          const response = await req.get("/public/..%2f../middleware.test.js");

          expect(response.statusCode).toEqual(403);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
          expect(response.text).toEqual(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>Forbidden</pre>
</body>
</html>`);
        });
      });

      describe('should work with "true" value when the `output.clean` is `true`', () => {
        const outputPath = path.resolve(
          __dirname,
          "./outputs/write-to-disk-true-with-clean",
        );

        let compiler;

        beforeAll(async () => {
          compiler = getCompiler({
            ...webpackConfig,
            output: {
              clean: true,
              filename: "bundle.js",
              path: outputPath,
            },
          });

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
            { writeToDisk: true },
          );

          fs.mkdirSync(outputPath, {
            recursive: true,
          });
          fs.writeFileSync(path.resolve(outputPath, "test.json"), "{}");
        });

        afterAll(async () => {
          del.sync(outputPath);

          await close(server, instance);
        });

        it("should find the bundle file on disk", (done) => {
          req.get("/bundle.js").expect(200, (error) => {
            if (error) {
              return done(error);
            }

            const bundlePath = path.resolve(outputPath, "bundle.js");

            expect(fs.existsSync(path.resolve(outputPath, "test.json"))).toBe(
              false,
            );

            expect(
              compiler.hooks.assetEmitted.taps.filter(
                (hook) => hook.name === "DevMiddleware",
              ).length,
            ).toBe(1);
            expect(fs.existsSync(bundlePath)).toBe(true);

            instance.invalidate();

            return compiler.hooks.done.tap(
              "DevMiddlewareWriteToDiskTest",
              () => {
                expect(
                  compiler.hooks.assetEmitted.taps.filter(
                    (hook) => hook.name === "DevMiddleware",
                  ).length,
                ).toBe(1);

                done();
              },
            );
          });
        });
      });

      describe('should work with "false" value', () => {
        let compiler;

        beforeAll(async () => {
          compiler = getCompiler({
            ...webpackConfig,
            output: {
              filename: "bundle.js",
              path: path.resolve(__dirname, "./outputs/write-to-disk-false"),
            },
          });

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
            { writeToDisk: false },
          );
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it("should not find the bundle file on disk", (done) => {
          req.get("/bundle.js").expect(200, (error) => {
            if (error) {
              return done(error);
            }

            const bundlePath = path.resolve(
              __dirname,
              "./outputs/write-to-disk-false/bundle.js",
            );

            expect(
              compiler.hooks.assetEmitted.taps.filter(
                (hook) => hook.name === "DevMiddleware",
              ).length,
            ).toBe(0);
            expect(fs.existsSync(bundlePath)).toBe(false);

            instance.invalidate();

            return compiler.hooks.done.tap(
              "DevMiddlewareWriteToDiskTest",
              () => {
                expect(
                  compiler.hooks.assetEmitted.taps.filter(
                    (hook) => hook.name === "DevMiddleware",
                  ).length,
                ).toBe(0);

                done();
              },
            );
          });
        });
      });

      describe('should work with "Function" value when it returns "true"', () => {
        let compiler;

        beforeAll(async () => {
          compiler = getCompiler({
            ...webpackConfig,
            output: {
              filename: "bundle.js",
              path: path.resolve(
                __dirname,
                "./outputs/write-to-disk-function-true",
              ),
            },
          });

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
            {
              writeToDisk: (filePath) => /bundle\.js$/.test(filePath),
            },
          );
        });

        afterAll(async () => {
          del.sync(
            path.posix.resolve(
              __dirname,
              "./outputs/write-to-disk-function-true",
            ),
          );

          await close(server, instance);
        });

        it("should find the bundle file on disk", async () => {
          const response = await req.get("/bundle.js");

          expect(response.statusCode).toEqual(200);

          const bundlePath = path.resolve(
            __dirname,
            "./outputs/write-to-disk-function-true/bundle.js",
          );

          expect(fs.existsSync(bundlePath)).toBe(true);
        });
      });

      describe('should work with "Function" value when it returns "false"', () => {
        let compiler;

        beforeAll(async () => {
          compiler = getCompiler({
            ...webpackConfig,
            output: {
              filename: "bundle.js",
              path: path.resolve(
                __dirname,
                "./outputs/write-to-disk-function-false",
              ),
            },
          });

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
            {
              writeToDisk: (filePath) => !/bundle\.js$/.test(filePath),
            },
          );
        });

        afterAll(async () => {
          del.sync(
            path.posix.resolve(
              __dirname,
              "./outputs/write-to-disk-function-false",
            ),
          );

          await close(server, instance);
        });

        it("should not find the bundle file on disk", async () => {
          const response = await req.get("/bundle.js");

          expect(response.statusCode).toEqual(200);

          const bundlePath = path.resolve(
            __dirname,
            "./outputs/write-to-disk-function-false/bundle.js",
          );

          expect(fs.existsSync(bundlePath)).toBe(false);
        });
      });

      describe("should work when assets have query string", () => {
        let compiler;

        beforeAll(async () => {
          compiler = getCompiler({
            ...webpackQueryStringConfig,
            output: {
              filename: "bundle.js?[contenthash]",
              path: path.resolve(
                __dirname,
                "./outputs/write-to-disk-query-string",
              ),
            },
          });

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
            { writeToDisk: true },
          );
        });

        afterAll(async () => {
          del.sync(
            path.posix.resolve(
              __dirname,
              "./outputs/write-to-disk-query-string",
            ),
          );

          await close(server, instance);
        });

        it("should find the bundle file on disk with no querystring", async () => {
          const response = await req.get("/bundle.js");

          expect(response.statusCode).toEqual(200);

          const bundlePath = path.resolve(
            __dirname,
            "./outputs/write-to-disk-query-string/bundle.js",
          );

          expect(fs.existsSync(bundlePath)).toBe(true);
        });
      });

      describe("should work in multi-compiler mode", () => {
        let compiler;

        beforeAll(async () => {
          compiler = getCompiler([
            {
              ...webpackMultiWatchOptionsConfig[0],
              output: {
                filename: "bundle.js",
                path: path.resolve(
                  __dirname,
                  "./outputs/write-to-disk-multi-compiler/static-one",
                ),
                publicPath: "/static-one/",
              },
            },
            {
              ...webpackMultiWatchOptionsConfig[1],
              output: {
                filename: "bundle.js",
                path: path.resolve(
                  __dirname,
                  "./outputs/write-to-disk-multi-compiler/static-two",
                ),
                publicPath: "/static-two/",
              },
            },
          ]);

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
            { writeToDisk: true },
          );
        });

        afterAll(async () => {
          del.sync(
            path.posix.resolve(
              __dirname,
              "./outputs/write-to-disk-multi-compiler/",
            ),
          );

          await close(server, instance);
        });

        it("should find the bundle files on disk", async () => {
          const response1 = await req.get("/static-one/bundle.js");

          expect(response1.statusCode).toEqual(200);

          const response2 = await req.get("/static-two/bundle.js");

          expect(response2.statusCode).toEqual(200);

          const bundleFiles = [
            "./outputs/write-to-disk-multi-compiler/static-one/bundle.js",
            "./outputs/write-to-disk-multi-compiler/static-one/index.html",
            "./outputs/write-to-disk-multi-compiler/static-one/svg.svg",
            "./outputs/write-to-disk-multi-compiler/static-two/bundle.js",
          ];

          for (const bundleFile of bundleFiles) {
            const bundlePath = path.resolve(__dirname, bundleFile);

            expect(fs.existsSync(bundlePath)).toBe(true);
          }
        });
      });

      describe('should work with "[hash]"/"[fullhash]" in the "output.path" and "output.publicPath" option', () => {
        let compiler;
        let hash;

        beforeAll(async () => {
          compiler = getCompiler({
            ...webpackConfig,
            ...{
              output: {
                filename: "bundle.js",
                publicPath: "/static/[fullhash]/",
                path: path.resolve(
                  __dirname,
                  "./outputs/write-to-disk-with-hash/dist_[fullhash]",
                ),
              },
            },
          });
          compiler.hooks.afterCompile.tap("wdm-test", ({ hash: h }) => {
            hash = h;
          });

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
            { writeToDisk: true },
          );

          await new Promise((resolve) => {
            const interval = setInterval(() => {
              if (hash) {
                clearInterval(interval);

                resolve();
              }
            }, 10);
          });
        });

        afterAll(async () => {
          del.sync(
            path.posix.resolve(__dirname, "./outputs/write-to-disk-with-hash/"),
          );

          await close(server, instance);
        });

        it("should find the bundle file on disk", async () => {
          const response = await req.get(`/static/${hash}/bundle.js`);

          expect(response.statusCode).toEqual(200);

          const bundlePath = path.resolve(
            __dirname,
            `./outputs/write-to-disk-with-hash/dist_${hash}/bundle.js`,
          );

          expect(fs.existsSync(bundlePath)).toBe(true);
        });
      });
    });

    describe("publicPath option", () => {
      describe('should work with "string" value', () => {
        beforeAll(async () => {
          const compiler = getCompiler(webpackConfig);

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
            { publicPath: "/public/" },
          );
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it('should return the "200" code for the "GET" request to the bundle file', async () => {
          const response = await req.get(`/public/bundle.js`);

          expect(response.statusCode).toEqual(200);
        });
      });

      describe('should work with "auto" value', () => {
        beforeAll(async () => {
          const compiler = getCompiler(webpackConfig);

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
            { publicPath: "auto" },
          );
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it('should return the "200" code for the "GET" request to the bundle file', async () => {
          const response = await req.get("/bundle.js");

          expect(response.statusCode).toEqual(200);
        });
      });
    });

    describe("res.locals.webpack.devMiddleware", () => {
      let locals;

      beforeAll(async () => {
        const compiler = getCompiler(webpackConfig);

        [server, req, instance] = await frameworkFactory(
          name,
          framework,
          compiler,
          {},
          {
            setupMiddlewares: (middlewares) => {
              middlewares.push((_req, res) => {
                // eslint-disable-next-line prefer-destructuring
                locals = res.locals;

                // Express API
                if (res.sendStatus) {
                  res.sendStatus(200);
                }
                // Connect API
                else {
                  // eslint-disable-next-line no-param-reassign
                  res.statusCode = 200;
                  res.end();
                }
              });
              return middlewares;
            },
          },
        );
      });

      afterAll(async () => {
        await close(server, instance);
      });

      it('should return the "200" code for the "GET" request', async () => {
        const response = await req.get("/foo/bar");

        expect(response.statusCode).toEqual(200);
        expect(locals.webpack.devMiddleware).toBeDefined();
      });
    });

    describe("index option", () => {
      describe('should work with "false" value', () => {
        beforeAll(async () => {
          const compiler = getCompiler(webpackConfig);

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
            { index: false, publicPath: "/" },
          );
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it('should return the "404" code for the "GET" request to the public path', async () => {
          const response = await req.get("/");

          expect(response.statusCode).toEqual(404);
          expect(response.headers["content-type"]).toEqual(
            get404ContentTypeHeader(name),
          );
        });

        it('should return the "200" code for the "GET" request to the "index.html" file', async () => {
          const response = await req.get("/index.html");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });
      });

      describe('should work with "true" value', () => {
        beforeAll(async () => {
          const compiler = getCompiler(webpackConfig);

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
            { index: true, publicPath: "/" },
          );
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it('should return the "200" code for the "GET" request to the public path', async () => {
          const response = await req.get("/");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });

        it('should return the "200" code for the "GET" request to the public path', async () => {
          const response = await req.get("/index.html");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });
      });

      describe('should work with "string" value', () => {
        beforeAll(async () => {
          const outputPath = path.resolve(__dirname, "./outputs/basic");
          const compiler = getCompiler({
            ...webpackConfig,
            output: {
              filename: "bundle.js",
              path: outputPath,
            },
          });

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
            {
              index: "default.html",
              publicPath: "/",
            },
          );

          instance.context.outputFileSystem.mkdirSync(outputPath, {
            recursive: true,
          });
          instance.context.outputFileSystem.writeFileSync(
            path.resolve(outputPath, "default.html"),
            "hello",
          );
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it('should return the "200" code for the "GET" request to the public path', async () => {
          const response = await req.get("/");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/html; charset=utf-8",
          );
        });
      });

      describe('should work with "string" value with a custom extension', () => {
        beforeAll(async () => {
          const outputPath = path.resolve(__dirname, "./outputs/basic");
          const compiler = getCompiler({
            ...webpackConfig,
            output: {
              filename: "bundle.js",
              path: outputPath,
            },
          });

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
            {
              index: "index.custom",
              publicPath: "/",
            },
          );

          instance.context.outputFileSystem.mkdirSync(outputPath, {
            recursive: true,
          });
          instance.context.outputFileSystem.writeFileSync(
            path.resolve(outputPath, "index.custom"),
            "hello",
          );
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it('should return the "200" code for the "GET" request to the public path', async () => {
          const response = await req.get("/");

          expect(response.statusCode).toEqual(200);
        });
      });

      describe('should work with "string" value without an extension', () => {
        beforeAll(async () => {
          const outputPath = path.resolve(__dirname, "./outputs/basic");
          const compiler = getCompiler({
            ...webpackConfig,
            output: {
              filename: "bundle.js",
              path: outputPath,
            },
          });

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
            { index: "noextension" },
          );

          instance.context.outputFileSystem.mkdirSync(outputPath, {
            recursive: true,
          });
          instance.context.outputFileSystem.writeFileSync(
            path.resolve(outputPath, "noextension"),
            "hello",
          );
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it('should return the "200" code for the "GET" request to the public path', async () => {
          const response = await req.get("/");

          expect(response.statusCode).toEqual(200);
        });
      });

      describe('should work with "string" value but the "index" option is a directory', () => {
        beforeAll(async () => {
          const outputPath = path.resolve(__dirname, "./outputs/basic");
          const compiler = getCompiler({
            ...webpackConfig,
            output: {
              filename: "bundle.js",
              path: outputPath,
            },
          });

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
            {
              index: "custom.html",
              publicPath: "/",
            },
          );

          instance.context.outputFileSystem.mkdirSync(outputPath, {
            recursive: true,
          });
          instance.context.outputFileSystem.mkdirSync(
            path.resolve(outputPath, "custom.html"),
          );
        });

        afterAll(async () => {
          await close(server, instance);
        });

        it('should return the "404" code for the "GET" request to the public path', async () => {
          const response = await req.get("/");

          expect(response.statusCode).toEqual(404);
        });
      });

      describe("should not handle request when index is neither a file nor a directory", () => {
        let compiler;
        let isDirectory;

        beforeAll(async () => {
          compiler = getCompiler(webpackConfig);

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
            {
              index: "default.html",
              publicPath: "/",
            },
          );

          isDirectory = jest
            .spyOn(instance.context.outputFileSystem, "statSync")
            .mockImplementation(() => {
              return {
                isFile: () => false,
                isDirectory: () => false,
              };
            });
        });

        afterAll(async () => {
          isDirectory.mockRestore();

          await close(server, instance);
        });

        it('should return the "404" code for the "GET" request to the public path', async () => {
          const response = await req.get("/");

          expect(response.statusCode).toEqual(404);
        });
      });
    });

    describe("etag", () => {
      describe("should work and generate weak etag", () => {
        beforeEach(async () => {
          const compiler = getCompiler(webpackConfig);

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
            {
              etag: "weak",
            },
          );
        });

        afterEach(async () => {
          await close(server, instance);
        });

        it('should return the "200" code for the "GET" request to the bundle file and set weak etag', async () => {
          const response = await req.get(`/bundle.js`);

          expect(response.statusCode).toEqual(200);
          expect(response.headers.etag).toBeDefined();
          expect(response.headers.etag.startsWith("W/")).toBe(true);
        });

        it('should return the "304" code for the "GET" request to the bundle file with etag and "if-none-match" header', async () => {
          const response1 = await req.get(`/bundle.js`);

          expect(response1.statusCode).toEqual(200);
          expect(response1.headers.etag).toBeDefined();
          expect(response1.headers.etag.startsWith("W/")).toBe(true);

          const response2 = await req
            .get(`/bundle.js`)
            .set("if-none-match", response1.headers.etag);

          expect(response2.statusCode).toEqual(304);
          expect(response2.headers.etag).toBeDefined();
          expect(response2.headers.etag.startsWith("W/")).toBe(true);

          const response3 = await req
            .get(`/bundle.js`)
            .set("if-none-match", `${response1.headers.etag}, test`);

          expect(response3.statusCode).toEqual(304);
          expect(response3.headers.etag).toBeDefined();
          expect(response3.headers.etag.startsWith("W/")).toBe(true);

          const response4 = await req
            .get(`/bundle.js`)
            .set("if-none-match", "*");

          expect(response4.statusCode).toEqual(304);
          expect(response4.headers.etag).toBeDefined();
          expect(response4.headers.etag.startsWith("W/")).toBe(true);

          const response5 = await req
            .get(`/bundle.js`)
            .set("if-none-match", "test");

          expect(response5.statusCode).toEqual(200);
          expect(response5.headers.etag).toBeDefined();
          expect(response5.headers.etag.startsWith("W/")).toBe(true);
        });

        it('should return the "200" code for the "GET" request to the bundle file with etag and "if-match" header', async () => {
          const response1 = await req.get(`/bundle.js`);

          expect(response1.statusCode).toEqual(200);
          expect(response1.headers.etag).toBeDefined();
          expect(response1.headers.etag.startsWith("W/")).toBe(true);

          const response2 = await req
            .get(`/bundle.js`)
            .set("if-match", response1.headers.etag);

          expect(response2.statusCode).toEqual(200);
          expect(response2.headers.etag).toBeDefined();
          expect(response2.headers.etag.startsWith("W/")).toBe(true);

          const response3 = await req
            .get(`/bundle.js`)
            .set("if-match", `${response1.headers.etag}, foo`);

          expect(response3.statusCode).toEqual(200);
          expect(response3.headers.etag).toBeDefined();
          expect(response3.headers.etag.startsWith("W/")).toBe(true);

          const response4 = await req.get(`/bundle.js`).set("if-match", "*");

          expect(response4.statusCode).toEqual(200);
          expect(response4.headers.etag).toBeDefined();
          expect(response4.headers.etag.startsWith("W/")).toBe(true);

          const response5 = await req.get(`/bundle.js`).set("if-match", "test");

          expect(response5.statusCode).toEqual(412);
        });

        it('should return the "412" code for the "GET" request to the bundle file with etag and wrong "if-match" header', async () => {
          const response1 = await req.get(`/bundle.js`);

          expect(response1.statusCode).toEqual(200);
          expect(response1.headers.etag).toBeDefined();
          expect(response1.headers.etag.startsWith("W/")).toBe(true);

          const response2 = await req.get(`/bundle.js`).set("if-match", "test");

          expect(response2.statusCode).toEqual(412);
        });

        it('should return the "200" code for the "GET" request to the bundle file with etag and "if-match" and "cache-control: no-cache" header', async () => {
          const response1 = await req.get(`/bundle.js`);

          expect(response1.statusCode).toEqual(200);
          expect(response1.headers.etag).toBeDefined();
          expect(response1.headers.etag.startsWith("W/")).toBe(true);

          const response2 = await req
            .get(`/bundle.js`)
            .set("if-match", response1.headers.etag)
            .set("Cache-Control", "no-cache");

          expect(response2.statusCode).toEqual(200);
          expect(response2.headers.etag).toBeDefined();
          expect(response2.headers.etag.startsWith("W/")).toBe(true);
        });

        it('should return the "206" code for the "GET" request with the valid range header and "if-range" header', async () => {
          const response = await req
            .get("/bundle.js")
            .set("if-range", '"test"')
            .set("Range", "bytes=3000-3500");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/javascript; charset=utf-8",
          );
          expect(response.headers.etag).toBeDefined();
          expect(response.headers.etag.startsWith("W/")).toBe(true);
        });
      });
    });

    describe("lastModified", () => {
      describe("should work and generate Last-Modified header", () => {
        beforeEach(async () => {
          const compiler = getCompiler(webpackConfig);

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
            {
              lastModified: true,
            },
          );
        });

        afterEach(async () => {
          await close(server, instance);
        });

        it('should return the "200" code for the "GET" request to the bundle file and set "Last-Modified"', async () => {
          const response = await req.get(`/bundle.js`);

          expect(response.statusCode).toEqual(200);
          expect(response.headers["last-modified"]).toBeDefined();
        });

        it('should return the "304" code for the "GET" request to the bundle file with "Last-Modified" and "if-modified-since" header', async () => {
          const response1 = await req.get(`/bundle.js`);

          expect(response1.statusCode).toEqual(200);
          expect(response1.headers["last-modified"]).toBeDefined();

          const response2 = await req
            .get(`/bundle.js`)
            .set("if-modified-since", response1.headers["last-modified"]);

          expect(response2.statusCode).toEqual(304);
          expect(response2.headers["last-modified"]).toBeDefined();

          const response3 = await req
            .get(`/bundle.js`)
            .set(
              "if-modified-since",
              new Date(
                parseHttpDate(response1.headers["last-modified"]) - 1000,
              ).toUTCString(),
            );

          expect(response3.statusCode).toEqual(200);
          expect(response3.headers["last-modified"]).toBeDefined();
        });

        it('should return the "200" code for the "GET" request to the bundle file with "Last-Modified" and "if-unmodified-since" header', async () => {
          const response1 = await req.get(`/bundle.js`);

          expect(response1.statusCode).toEqual(200);
          expect(response1.headers["last-modified"]).toBeDefined();

          const response2 = await req
            .get(`/bundle.js`)
            .set("if-unmodified-since", response1.headers["last-modified"]);

          expect(response2.statusCode).toEqual(200);
          expect(response2.headers["last-modified"]).toBeDefined();

          const response3 = await req
            .get(`/bundle.js`)
            .set("if-unmodified-since", "Fri, 29 Mar 2020 10:25:50 GMT");

          expect(response3.statusCode).toEqual(412);
        });

        it('should return the "412" code for the "GET" request to the bundle file with etag and "if-unmodified-since" header', async () => {
          const response1 = await req.get(`/bundle.js`);

          expect(response1.statusCode).toEqual(200);
          expect(response1.headers["last-modified"]).toBeDefined();

          const response2 = await req
            .get(`/bundle.js`)
            .set(
              "if-unmodified-since",
              new Date(
                parseHttpDate(response1.headers["last-modified"]) - 1000,
              ).toUTCString(),
            );

          expect(response2.statusCode).toEqual(412);
        });

        it('should return the "200" code for the "GET" request to the bundle file with etag and "if-match" and "cache-control: no-cache" header', async () => {
          const response1 = await req.get(`/bundle.js`);

          expect(response1.statusCode).toEqual(200);
          expect(response1.headers["last-modified"]).toBeDefined();

          const response2 = await req
            .get(`/bundle.js`)
            .set("if-unmodified-since", response1.headers["last-modified"])
            .set("Cache-Control", "no-cache");

          expect(response2.statusCode).toEqual(200);
          expect(response1.headers["last-modified"]).toBeDefined();
        });

        it('should return the "200" code for the "GET" request with the valid range header and old "if-range" header', async () => {
          const response = await req
            .get("/bundle.js")
            .set("if-range", new Date(1000).toUTCString())
            .set("Range", "bytes=3000-3500");

          expect(response.statusCode).toEqual(200);
          expect(response.headers["content-type"]).toEqual(
            "text/javascript; charset=utf-8",
          );
          expect(response.headers["last-modified"]).toBeDefined();
        });
      });

      describe('should work and prefer "if-match" and "if-none-match"', () => {
        beforeEach(async () => {
          const compiler = getCompiler(webpackConfig);

          [server, req, instance] = await frameworkFactory(
            name,
            framework,
            compiler,
            {
              etag: "weak",
              lastModified: true,
            },
          );
        });

        afterEach(async () => {
          await close(server, instance);
        });

        it('should return the "304" code for the "GET" request to the bundle file and prefer "if-match" over "if-unmodified-since"', async () => {
          const response1 = await req.get(`/bundle.js`);

          expect(response1.statusCode).toEqual(200);
          expect(response1.headers["last-modified"]).toBeDefined();
          expect(response1.headers.etag).toBeDefined();

          const response2 = await req
            .get(`/bundle.js`)
            .set("if-match", response1.headers.etag)
            .set(
              "if-unmodified-since",
              new Date(
                parseHttpDate(response1.headers["last-modified"]) - 1000,
              ).toUTCString(),
            );

          expect(response2.statusCode).toEqual(200);
          expect(response2.headers["last-modified"]).toBeDefined();
          expect(response2.headers.etag).toBeDefined();
        });

        it('should return the "304" code for the "GET" request to the bundle file and prefer "if-none-match" over "if-modified-since"', async () => {
          const response1 = await req.get(`/bundle.js`);

          expect(response1.statusCode).toEqual(200);
          expect(response1.headers["last-modified"]).toBeDefined();
          expect(response1.headers.etag).toBeDefined();

          const response2 = await req
            .get(`/bundle.js`)
            .set("if-none-match", response1.headers.etag)
            .set(
              "if-modified-since",
              new Date(
                parseHttpDate(response1.headers["last-modified"]) - 1000,
              ).toUTCString(),
            );

          expect(response2.statusCode).toEqual(304);
          expect(response2.headers["last-modified"]).toBeDefined();
          expect(response2.headers.etag).toBeDefined();
        });
      });
    });
  });
});
