const { logger } = require('rslog');
/** @typedef {import("../index.js").IncomingMessage} IncomingMessage */
/** @typedef {import("../index.js").ServerResponse} ServerResponse */

/**
 * @template {IncomingMessage} Request
 * @template {ServerResponse} Response
 * @param {import("../index.js").FilledContext<Request, Response>} context
 * @param {(...args: any[]) => any} callback
 * @param {Request} [req]
 * @returns {void}
 */
function ready(context, callback, req) {
  if (context.state) {
    callback(context.stats);

    return;
  }

  const name = (req && req.url) || callback.name;

  logger.debug(`[rsbuild-dev-middleware] wait until bundle finished${name ? `: ${name}` : ""}`);

  context.callbacks.push(callback);
}

module.exports = ready;
