import {
  Configuration,
  Compiler,
  MultiCompiler,
  Stats,
  MultiStats,
} from "webpack";
import {
  IncomingMessage,
  ServerResponse,
  WithOptional,
  Context,
} from "../index.js";

export function setupHooks<
  Request extends IncomingMessage,
  Response extends ServerResponse,
>(
  context: WithOptional<
    Context<Request, Response>,
    "watching" | "outputFileSystem"
  >,
): void {
  function invalid() {
    if (context.state) {
      context.logger.log("Compilation starting...");
    }

    // We are now in invalid state
    context.state = false;
    context.stats = undefined;
  }

  /**
   * @param {Stats | MultiStats} stats
   */
  function done(stats: Stats | MultiStats) {
    // We are now on valid state
    context.state = true;
    context.stats = stats;

    // Do the stuff in nextTick, because bundle may be invalidated if a change happened while compiling
    process.nextTick(() => {
      const { logger, state, callbacks } = context;

      // Check if still in valid state
      if (!state) {
        return;
      }

      logger.log("Compilation finished");

      context.callbacks = [];

      // Execute callback that are delayed
      callbacks.forEach((callback) => {
        callback(stats);
      });
    });
  }

  const compiler = context.compiler as Compiler;
  compiler.hooks.watchRun.tap("webpack-dev-middleware", invalid);
  compiler.hooks.invalid.tap("webpack-dev-middleware", invalid);
  compiler.hooks.done.tap("webpack-dev-middleware", done);
}
