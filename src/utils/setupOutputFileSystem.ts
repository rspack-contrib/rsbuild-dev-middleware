import { createFsFromVolume, Volume } from "memfs";
import { MultiCompiler } from "webpack";
import {
  IncomingMessage,
  ServerResponse,
  WithOptional,
  Context,
} from "../index";

export function setupOutputFileSystem<
  Request extends IncomingMessage,
  Response extends ServerResponse,
>(
  context: WithOptional<
    Context<Request, Response>,
    "watching" | "outputFileSystem"
  >,
): void {
  let outputFileSystem: any;

  // Don't use `memfs` when developer wants to write everything to a disk, because it doesn't make sense.
  if (context.options.writeToDisk !== true) {
    outputFileSystem = createFsFromVolume(new Volume());
  } else {
    const isMultiCompiler = (context.compiler as MultiCompiler).compilers;

    if (isMultiCompiler) {
      // Prefer compiler with `devServer` option or fallback on the first
      // TODO we need to support webpack-dev-server as a plugin or revisit it
      const compiler = (context.compiler as MultiCompiler).compilers.filter(
        (item) =>
          Object.prototype.hasOwnProperty.call(item.options, "devServer"),
      );

      ({ outputFileSystem } =
        compiler[0] || (context.compiler as MultiCompiler).compilers[0]);
    } else {
      ({ outputFileSystem } = context.compiler);
    }
  }

  const compilers = (context.compiler as MultiCompiler).compilers || [
    context.compiler,
  ];

  for (const compiler of compilers) {
    compiler.outputFileSystem = outputFileSystem;
  }

  context.outputFileSystem = outputFileSystem;
}
