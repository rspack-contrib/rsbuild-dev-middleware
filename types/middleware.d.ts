export = wrapper;
/**
 * @template {IncomingMessage} Request
 * @template {ServerResponse} Response
 * @typedef {Object} SendErrorOptions send error options
 * @property {Record<string, number | string | string[] | undefined>=} headers headers
 */
/**
 * @template {IncomingMessage} Request
 * @template {ServerResponse} Response
 * @param {import("./index.js").FilledContext<Request, Response>} context
 * @return {import("./index.js").Middleware<Request, Response>}
 */
declare function wrapper<
  Request extends IncomingMessage,
  Response extends ServerResponse,
>(
  context: import("./index.js").FilledContext<Request, Response>,
): import("./index.js").Middleware<Request, Response>;
declare namespace wrapper {
  export {
    Stats,
    ExpectedResponse,
    SendErrorOptions,
    NextFunction,
    IncomingMessage,
    ServerResponse,
    NormalizedHeaders,
    ReadStream,
  };
}
type Stats = import("fs").Stats;
type ExpectedResponse = {
  status?: ((status: number) => void) | undefined;
  send?: ((data: any) => void) | undefined;
  pipeInto?: ((data: any) => void) | undefined;
};
/**
 * send error options
 */
type SendErrorOptions<
  Request extends IncomingMessage,
  Response extends ServerResponse,
> = {
  /**
   * headers
   */
  headers?: Record<string, number | string | string[] | undefined> | undefined;
};
type NextFunction = import("./index.js").NextFunction;
type IncomingMessage = import("./index.js").IncomingMessage;
type ServerResponse = import("./index.js").ServerResponse;
type NormalizedHeaders = import("./index.js").NormalizedHeaders;
type ReadStream = import("fs").ReadStream;
