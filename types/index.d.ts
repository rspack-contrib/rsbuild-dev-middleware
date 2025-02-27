export = wdm;
/** @typedef {import("webpack").Compiler} Compiler */
/** @typedef {import("webpack").MultiCompiler} MultiCompiler */
/** @typedef {import("webpack").Configuration} Configuration */
/** @typedef {import("webpack").Stats} Stats */
/** @typedef {import("webpack").MultiStats} MultiStats */
/** @typedef {import("fs").ReadStream} ReadStream */
/**
 * @typedef {Object} ExtendedServerResponse
 * @property {{ webpack?: { devMiddleware?: Context<IncomingMessage, ServerResponse> } }} [locals]
 */
/** @typedef {import("http").IncomingMessage} IncomingMessage */
/** @typedef {import("http").ServerResponse & ExtendedServerResponse} ServerResponse */
/**
 * @callback NextFunction
 * @param {any} [err]
 * @return {void}
 */
/**
 * @typedef {NonNullable<Configuration["watchOptions"]>} WatchOptions
 */
/**
 * @typedef {Compiler["watching"]} Watching
 */
/**
 * @typedef {ReturnType<MultiCompiler["watch"]>} MultiWatching
 */
/**
 * @typedef {Object & { createReadStream?: import("fs").createReadStream, statSync?: import("fs").statSync, lstat?: import("fs").lstat, readFileSync?: import("fs").readFileSync }} OutputFileSystem
 */
/**
 * @callback Callback
 * @param {Stats | MultiStats} [stats]
 */
/**
 * @typedef {Object} ResponseData
 * @property {Buffer | ReadStream} data
 * @property {number} byteLength
 */
/**
 * @template {IncomingMessage} [RequestInternal=IncomingMessage]
 * @template {ServerResponse} [ResponseInternal=ServerResponse]
 * @param {RequestInternal} req
 * @param {ResponseInternal} res
 * @param {Buffer | ReadStream} data
 * @param {number} byteLength
 * @return {ResponseData}
 */
/**
 * @template {IncomingMessage} [RequestInternal=IncomingMessage]
 * @template {ServerResponse} [ResponseInternal=ServerResponse]
 * @typedef {Object} Context
 * @property {boolean} state
 * @property {Stats | MultiStats | undefined} stats
 * @property {Callback[]} callbacks
 * @property {Options<RequestInternal, ResponseInternal>} options
 * @property {Compiler | MultiCompiler} compiler
 * @property {Watching | MultiWatching | undefined} watching
 * @property {OutputFileSystem} outputFileSystem
 */
/**
 * @template {IncomingMessage} [RequestInternal=IncomingMessage]
 * @template {ServerResponse} [ResponseInternal=ServerResponse]
 * @typedef {WithoutUndefined<Context<RequestInternal, ResponseInternal>, "watching">} FilledContext
 */
/** @typedef {Record<string, string | number> | Array<{ key: string, value: number | string }>} NormalizedHeaders */
/**
 * @template {IncomingMessage} [RequestInternal=IncomingMessage]
 * @template {ServerResponse} [ResponseInternal=ServerResponse]
 * @typedef {NormalizedHeaders | ((req: RequestInternal, res: ResponseInternal, context: Context<RequestInternal, ResponseInternal>) =>  void | undefined | NormalizedHeaders) | undefined} Headers
 */
/**
 * @template {IncomingMessage} [RequestInternal = IncomingMessage]
 * @template {ServerResponse} [ResponseInternal = ServerResponse]
 * @typedef {Object} Options
 * @property {boolean | ((targetPath: string, compilationName?: string) => boolean)} [writeToDisk]
 * @property {NonNullable<Configuration["output"]>["publicPath"]} [publicPath]
 * @property {boolean | string} [index]
 * @property {boolean} [lastModified]
 */
/**
 * @template {IncomingMessage} [RequestInternal=IncomingMessage]
 * @template {ServerResponse} [ResponseInternal=ServerResponse]
 * @callback Middleware
 * @param {RequestInternal} req
 * @param {ResponseInternal} res
 * @param {NextFunction} next
 * @return {Promise<void>}
 */
/** @typedef {import("./utils/getFilenameFromUrl").Extra} Extra */
/**
 * @callback GetFilenameFromUrl
 * @param {string} url
 * @param {Extra=} extra
 * @returns {string | undefined}
 */
/**
 * @callback WaitUntilValid
 * @param {Callback} callback
 */
/**
 * @callback Invalidate
 * @param {Callback} callback
 */
/**
 * @callback Close
 * @param {(err: Error | null | undefined) => void} callback
 */
/**
 * @template {IncomingMessage} RequestInternal
 * @template {ServerResponse} ResponseInternal
 * @typedef {Object} AdditionalMethods
 * @property {GetFilenameFromUrl} getFilenameFromUrl
 * @property {WaitUntilValid} waitUntilValid
 * @property {Invalidate} invalidate
 * @property {Close} close
 * @property {Context<RequestInternal, ResponseInternal>} context
 */
/**
 * @template {IncomingMessage} [RequestInternal=IncomingMessage]
 * @template {ServerResponse} [ResponseInternal=ServerResponse]
 * @typedef {Middleware<RequestInternal, ResponseInternal> & AdditionalMethods<RequestInternal, ResponseInternal>} API
 */
/**
 * @template T
 * @template {keyof T} K
 * @typedef {Omit<T, K> & Partial<T>} WithOptional
 */
/**
 * @template T
 * @template {keyof T} K
 * @typedef {T & { [P in K]: NonNullable<T[P]> }} WithoutUndefined
 */
/**
 * @template {IncomingMessage} [RequestInternal=IncomingMessage]
 * @template {ServerResponse} [ResponseInternal=ServerResponse]
 * @param {Compiler | MultiCompiler} compiler
 * @param {Options<RequestInternal, ResponseInternal>} [options]
 * @returns {API<RequestInternal, ResponseInternal>}
 */
declare function wdm<
  RequestInternal extends IncomingMessage = import("http").IncomingMessage,
  ResponseInternal extends ServerResponse = ServerResponse,
>(
  compiler: Compiler | MultiCompiler,
  options?: Options<RequestInternal, ResponseInternal> | undefined,
): API<RequestInternal, ResponseInternal>;
declare namespace wdm {
  export {
    Compiler,
    MultiCompiler,
    Configuration,
    Stats,
    MultiStats,
    ReadStream,
    ExtendedServerResponse,
    IncomingMessage,
    ServerResponse,
    NextFunction,
    WatchOptions,
    Watching,
    MultiWatching,
    OutputFileSystem,
    Callback,
    ResponseData,
    Context,
    FilledContext,
    NormalizedHeaders,
    Headers,
    Options,
    Middleware,
    Extra,
    GetFilenameFromUrl,
    WaitUntilValid,
    Invalidate,
    Close,
    AdditionalMethods,
    API,
    WithOptional,
    WithoutUndefined,
  };
}
type Compiler = import("webpack").Compiler;
type MultiCompiler = import("webpack").MultiCompiler;
type Configuration = import("webpack").Configuration;
type Stats = import("webpack").Stats;
type MultiStats = import("webpack").MultiStats;
type ReadStream = import("fs").ReadStream;
type ExtendedServerResponse = {
  locals?:
    | {
        webpack?: {
          devMiddleware?: Context<IncomingMessage, ServerResponse>;
        };
      }
    | undefined;
};
type IncomingMessage = import("http").IncomingMessage;
type ServerResponse = import("http").ServerResponse & ExtendedServerResponse;
type NextFunction = (err?: any) => void;
type WatchOptions = NonNullable<Configuration["watchOptions"]>;
type Watching = Compiler["watching"];
type MultiWatching = ReturnType<MultiCompiler["watch"]>;
type OutputFileSystem = Object & {
  createReadStream?: typeof import("fs").createReadStream;
  statSync?: import("fs").StatSyncFn;
  lstat?: typeof import("fs").lstat;
  readFileSync?: typeof import("fs").readFileSync;
};
type Callback = (
  stats?: import("webpack").Stats | import("webpack").MultiStats | undefined,
) => any;
type ResponseData = {
  data: Buffer | ReadStream;
  byteLength: number;
};
type Context<
  RequestInternal extends IncomingMessage = import("http").IncomingMessage,
  ResponseInternal extends ServerResponse = ServerResponse,
> = {
  state: boolean;
  stats: Stats | MultiStats | undefined;
  callbacks: Callback[];
  options: Options<RequestInternal, ResponseInternal>;
  compiler: Compiler | MultiCompiler;
  watching: Watching | MultiWatching | undefined;
  outputFileSystem: OutputFileSystem;
};
type FilledContext<
  RequestInternal extends IncomingMessage = import("http").IncomingMessage,
  ResponseInternal extends ServerResponse = ServerResponse,
> = WithoutUndefined<Context<RequestInternal, ResponseInternal>, "watching">;
type NormalizedHeaders =
  | Record<string, string | number>
  | Array<{
      key: string;
      value: number | string;
    }>;
type Headers<
  RequestInternal extends IncomingMessage = import("http").IncomingMessage,
  ResponseInternal extends ServerResponse = ServerResponse,
> =
  | NormalizedHeaders
  | ((
      req: RequestInternal,
      res: ResponseInternal,
      context: Context<RequestInternal, ResponseInternal>,
    ) => void | undefined | NormalizedHeaders)
  | undefined;
type Options<
  RequestInternal extends IncomingMessage = import("http").IncomingMessage,
  ResponseInternal extends ServerResponse = ServerResponse,
> = {
  writeToDisk?:
    | boolean
    | ((targetPath: string, compilationName?: string) => boolean)
    | undefined;
  publicPath?: NonNullable<Configuration["output"]>["publicPath"];
  index?: string | boolean | undefined;
  lastModified?: boolean | undefined;
};
type Middleware<
  RequestInternal extends IncomingMessage = import("http").IncomingMessage,
  ResponseInternal extends ServerResponse = ServerResponse,
> = (
  req: RequestInternal,
  res: ResponseInternal,
  next: NextFunction,
) => Promise<void>;
type Extra = import("./utils/getFilenameFromUrl").Extra;
type GetFilenameFromUrl = (
  url: string,
  extra?: Extra | undefined,
) => string | undefined;
type WaitUntilValid = (callback: Callback) => any;
type Invalidate = (callback: Callback) => any;
type Close = (callback: (err: Error | null | undefined) => void) => any;
type AdditionalMethods<
  RequestInternal extends IncomingMessage,
  ResponseInternal extends ServerResponse,
> = {
  getFilenameFromUrl: GetFilenameFromUrl;
  waitUntilValid: WaitUntilValid;
  invalidate: Invalidate;
  close: Close;
  context: Context<RequestInternal, ResponseInternal>;
};
type API<
  RequestInternal extends IncomingMessage = import("http").IncomingMessage,
  ResponseInternal extends ServerResponse = ServerResponse,
> = Middleware<RequestInternal, ResponseInternal> &
  AdditionalMethods<RequestInternal, ResponseInternal>;
type WithOptional<T, K extends keyof T> = Omit<T, K> & Partial<T>;
type WithoutUndefined<T, K extends keyof T> = T & {
  [P in K]: NonNullable<T[P]>;
};
