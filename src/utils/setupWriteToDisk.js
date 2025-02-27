const fs = require("fs");
const path = require("path");

const { logger } = require('rslog');

/** @typedef {import("webpack").Compiler} Compiler */
/** @typedef {import("webpack").MultiCompiler} MultiCompiler */
/** @typedef {import("webpack").Compilation} Compilation */
/** @typedef {import("../index.js").IncomingMessage} IncomingMessage */
/** @typedef {import("../index.js").ServerResponse} ServerResponse */

/**
 * @template {IncomingMessage} Request
 * @template {ServerResponse} Response
 * @param {import("../index.js").WithOptional<import("../index.js").Context<Request, Response>, "watching" | "outputFileSystem">} context
 */
function setupWriteToDisk(context) {
  /**
   * @type {Compiler[]}
   */
  const compilers =
    /** @type {MultiCompiler} */
    (context.compiler).compilers || [context.compiler];

  for (const compiler of compilers) {
    compiler.hooks.emit.tap("DevMiddleware", () => {
      // @ts-ignore
      if (compiler.hasWebpackDevMiddlewareAssetEmittedCallback) {
        return;
      }

      compiler.hooks.assetEmitted.tapAsync(
        "DevMiddleware",
        (_file, info, callback) => {
          const { targetPath, content, compilation } = info;
          const { writeToDisk: filter } = context.options;
          const allowWrite =
            filter && typeof filter === "function"
              ? filter(targetPath, compilation.name)
              : true;

          if (!allowWrite) {
            return callback();
          }

          const dir = path.dirname(targetPath);
          const name = compiler.options.name
            ? `Child "${compiler.options.name}": `
            : "";

          return fs.mkdir(dir, { recursive: true }, (mkdirError) => {
            if (mkdirError) {
              logger.error(
                `[rsbuild-dev-middleware] ${name}Unable to write "${dir}" directory to disk:\n${mkdirError}`,
              );

              return callback(mkdirError);
            }

            return fs.writeFile(targetPath, content, (writeFileError) => {
              if (writeFileError) {
                logger.error(
                  `[rsbuild-dev-middleware] ${name}Unable to write "${targetPath}" asset to disk:\n${writeFileError}`,
                );

                return callback(writeFileError);
              }

              logger.debug(
                `[rsbuild-dev-middleware] ${name}Asset written to disk: "${targetPath}"`,
              );

              return callback();
            });
          });
        },
      );

      // @ts-ignore
      compiler.hasWebpackDevMiddlewareAssetEmittedCallback = true;
    });
  }
}

module.exports = setupWriteToDisk;
