import { IncomingMessage, ServerResponse, FilledContext } from "../index.js";

export function ready<
  Request extends IncomingMessage,
  Response extends ServerResponse,
>(
  context: FilledContext<Request, Response>,
  callback: (...args: any[]) => any,
  req?: Request,
): void {
  if (context.state) {
    callback(context.stats);

    return;
  }

  const name = (req && req.url) || callback.name;
  context.logger.info(`wait until bundle finished${name ? `: ${name}` : ""}`);
  context.callbacks.push(callback);
}
