import { Stats, MultiStats } from "webpack";
import { IncomingMessage, ServerResponse, FilledContext } from "../index.js";

export function getPaths<
  Request extends IncomingMessage,
  Response extends ServerResponse,
>(
  context: FilledContext<Request, Response>,
): { outputPath: string; publicPath: string }[] {
  const { stats, options } = context;
  const childStats: Stats[] = (stats as MultiStats).stats
    ? (stats as MultiStats).stats
    : [stats as Stats];

  const publicPaths: { outputPath: string; publicPath: string }[] = [];

  for (const { compilation } of childStats) {
    // The `output.path` is always present and always absolute
    const outputPath = compilation.getPath(
      compilation.outputOptions.path || "",
    );
    const publicPath = options.publicPath
      ? compilation.getPath(options.publicPath)
      : compilation.outputOptions.publicPath
        ? compilation.getPath(compilation.outputOptions.publicPath)
        : "";

    publicPaths.push({ outputPath, publicPath });
  }

  return publicPaths;
}
