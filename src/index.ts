import {
  IncomingMessage as HttpIncomingMessage,
  ServerResponse as HttpServerResponse,
} from "http";
import {
  Compiler,
  MultiCompiler,
  Configuration,
  Stats,
  MultiStats,
} from "webpack";
import {
  createReadStream,
  statSync,
  lstat,
  readFileSync,
  ReadStream,
} from "fs";

import middleware from "./middleware";
import { getFilenameFromUrl } from "./utils/getFilenameFromUrl";
import { setupHooks } from "./utils/setupHooks";
import { setupWriteToDisk } from "./utils/setupWriteToDisk";
import { setupOutputFileSystem } from "./utils/setupOutputFileSystem";
import { ready } from "./utils/ready";

const noop = () => {};

export type IncomingMessage = HttpIncomingMessage;
export type ServerResponse = HttpServerResponse & {
  locals?: {
    webpack?: {
      devMiddleware?: Context<IncomingMessage, ServerResponse>;
    };
  };
};

export type NextFunction = (err?: any) => void;

type WatchOptions = NonNullable<Configuration["watchOptions"]>;

type Watching = Compiler["watching"];
type MultiWatching = ReturnType<MultiCompiler["watch"]>;

type OutputFileSystem = {
  createReadStream?: typeof createReadStream;
  statSync?: typeof statSync;
  lstat?: typeof lstat;
  readFileSync?: typeof readFileSync;
} & Record<string, any>;

type Logger = ReturnType<Compiler["getInfrastructureLogger"]>;

type Callback = (stats?: Stats | MultiStats) => void;

interface ResponseData {
  data: Buffer | ReadStream;
  byteLength: number;
}

export interface Context<
  RequestInternal = IncomingMessage,
  ResponseInternal = ServerResponse,
> {
  state: boolean;
  stats?: Stats | MultiStats;
  callbacks: Callback[];
  options: Options<RequestInternal, ResponseInternal>;
  compiler: Compiler | MultiCompiler;
  watching?: Watching | MultiWatching;
  logger: Logger;
  outputFileSystem: OutputFileSystem;
}

export type FilledContext<
  RequestInternal = IncomingMessage,
  ResponseInternal = ServerResponse,
> = WithoutUndefined<Context<RequestInternal, ResponseInternal>, "watching">;

export type NormalizedHeaders =
  | Record<string, string | number>
  | Array<{ key: string; value: number | string }>;

type Headers<
  RequestInternal = IncomingMessage,
  ResponseInternal = ServerResponse,
> =
  | NormalizedHeaders
  | ((
      req: RequestInternal,
      res: ResponseInternal,
      context: Context<RequestInternal, ResponseInternal>,
    ) => void | undefined | NormalizedHeaders)
  | undefined;

interface Options<
  RequestInternal = IncomingMessage,
  ResponseInternal = ServerResponse,
> {
  writeToDisk?: boolean | ((targetPath: string) => boolean);
  publicPath?: NonNullable<Configuration["output"]>["publicPath"];
  index?: boolean | string;
  lastModified?: boolean;
}

export type Middleware<
  RequestInternal = IncomingMessage,
  ResponseInternal = ServerResponse,
> = (
  req: RequestInternal,
  res: ResponseInternal,
  next: NextFunction,
) => Promise<void>;

type Extra = import("./utils/getFilenameFromUrl").Extra;

type GetFilenameFromUrl = (url: string, extra?: Extra) => string | undefined;

type WaitUntilValid = (callback: Callback) => void;
type Invalidate = (callback: Callback) => void;
type Close = (callback: (err: Error | null | undefined) => void) => void;

interface AdditionalMethods<
  RequestInternal = IncomingMessage,
  ResponseInternal = ServerResponse,
> {
  getFilenameFromUrl: GetFilenameFromUrl;
  waitUntilValid: WaitUntilValid;
  invalidate: Invalidate;
  close: Close;
  context: Context<RequestInternal, ResponseInternal>;
}

type API<
  RequestInternal = IncomingMessage,
  ResponseInternal = ServerResponse,
> = Middleware<RequestInternal, ResponseInternal> &
  AdditionalMethods<RequestInternal, ResponseInternal>;

export type WithOptional<T, K extends keyof T> = Omit<T, K> & Partial<T>;

type WithoutUndefined<T, K extends keyof T> = T & {
  [P in K]: NonNullable<T[P]>;
};

function wdm<
  RequestInternal = IncomingMessage,
  ResponseInternal = ServerResponse,
>(
  compiler: Compiler | MultiCompiler,
  options: Options<RequestInternal, ResponseInternal> = {},
): API<RequestInternal, ResponseInternal> {
  const context: WithOptional<
    Context<RequestInternal, ResponseInternal>,
    "watching" | "outputFileSystem"
  > = {
    state: false,
    stats: undefined,
    callbacks: [],
    options,
    compiler,
    logger: compiler.getInfrastructureLogger("webpack-dev-middleware"),
  };

  setupHooks(context);

  if (options.writeToDisk) {
    setupWriteToDisk(context);
  }

  setupOutputFileSystem(context);

  if ((context.compiler as Compiler).watching) {
    context.watching = (context.compiler as Compiler).watching;
  } else {
    const errorHandler = (error: Error | null | undefined) => {
      if (error) {
        context.logger.error(error);
      }
    };

    if (Array.isArray((context.compiler as MultiCompiler).compilers)) {
      const multiCompiler = context.compiler as MultiCompiler;
      const watchOptions = multiCompiler.compilers.map(
        (childCompiler) => childCompiler.options.watchOptions || {},
      );

      context.watching = multiCompiler.watch(watchOptions, errorHandler);
    } else {
      const singleCompiler = context.compiler as Compiler;
      const watchOptions = singleCompiler.options.watchOptions || {};

      context.watching = singleCompiler.watch(watchOptions, errorHandler);
    }
  }

  const filledContext = context as FilledContext<
    RequestInternal,
    ResponseInternal
  >;
  const instance = middleware(filledContext) as API<
    RequestInternal,
    ResponseInternal
  >;

  instance.getFilenameFromUrl = (url, extra) =>
    getFilenameFromUrl(filledContext, url, extra);

  instance.waitUntilValid = (callback = noop) => {
    ready(filledContext, callback);
  };

  instance.invalidate = (callback = noop) => {
    ready(filledContext, callback);
    filledContext.watching!.invalidate();
  };

  instance.close = (callback = noop) => {
    filledContext.watching!.close(callback);
  };

  instance.context = filledContext;

  return instance;
}

export default wdm;
