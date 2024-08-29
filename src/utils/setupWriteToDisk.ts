import fs from "fs";
import path from "path";
import { Compiler, MultiCompiler } from "webpack";
import {
  IncomingMessage,
  ServerResponse,
  WithOptional,
  Context,
} from "../index";

export function setupWriteToDisk<
  Request extends IncomingMessage,
  Response extends ServerResponse,
>(
  context: WithOptional<
    Context<Request, Response>,
    "watching" | "outputFileSystem"
  >,
): void {
  const compilers: Compiler[] = (context.compiler as MultiCompiler)
    .compilers || [context.compiler as Compiler];

  for (const compiler of compilers) {
    compiler.hooks.emit.tap("DevMiddleware", () => {
      if ((compiler as any).hasWebpackDevMiddlewareAssetEmittedCallback) {
        return;
      }

      compiler.hooks.assetEmitted.tapAsync(
        "DevMiddleware",
        (file, info, callback) => {
          const { targetPath, content } = info;
          const { writeToDisk: filter } = context.options;
          const allowWrite =
            filter && typeof filter === "function" ? filter(targetPath) : true;

          if (!allowWrite) {
            return callback();
          }

          const dir = path.dirname(targetPath);
          const name = compiler.options.name
            ? `Child "${compiler.options.name}": `
            : "";

          return fs.mkdir(dir, { recursive: true }, (mkdirError) => {
            if (mkdirError) {
              context.logger.error(
                `${name}Unable to write "${dir}" directory to disk:\n${mkdirError}`,
              );
              return callback(mkdirError);
            }

            return fs.writeFile(targetPath, content, (writeFileError) => {
              if (writeFileError) {
                context.logger.error(
                  `${name}Unable to write "${targetPath}" asset to disk:\n${writeFileError}`,
                );
                return callback(writeFileError);
              }

              context.logger.log(
                `${name}Asset written to disk: "${targetPath}"`,
              );
              return callback();
            });
          });
        },
      );

      (compiler as any).hasWebpackDevMiddlewareAssetEmittedCallback = true;
    });
  }
}
