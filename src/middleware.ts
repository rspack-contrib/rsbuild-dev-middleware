import onFinishedStream from "on-finished";
import { getFilenameFromUrl } from "./utils/getFilenameFromUrl";
import { ready } from "./utils/ready";
import { parseTokenList } from "./utils/parseTokenList";
import { memorize } from "./utils/memorize";
import { Stats, ReadStream } from "fs";
import { Range, Result, Ranges } from "range-parser";
import { Context, FilledContext, Middleware } from "./index";
import { escapeHtml } from "./utils/escapeHtml";

type ExpectedResponse = {
  status?: (status: number) => void;
  send?: (data: any) => void;
  pipeInto?: (data: any) => void;
};

type NextFunction = import("./index").NextFunction;
type IncomingMessage = import("./index").IncomingMessage;
type ServerResponse = import("./index").ServerResponse;
type NormalizedHeaders = import("./index").NormalizedHeaders;

const BYTES_RANGE_REGEXP = /^ *bytes/i;

/**
 * @param {string} type
 * @param {number} size
 * @param {Range} [range]
 * @returns {string}
 */
function getValueContentRangeHeader(
  type: string,
  size: number,
  range?: Range,
): string {
  return `${type} ${range ? `${range.start}-${range.end}` : "*"}/${size}`;
}

/**
 * Parse an HTTP Date into a number.
 */
function parseHttpDate(date: string): number {
  const timestamp = date && Date.parse(date);

  // istanbul ignore next: guard against date.js Date.parse patching
  return typeof timestamp === "number" ? timestamp : NaN;
}

const CACHE_CONTROL_NO_CACHE_REGEXP = /(?:^|,)\s*?no-cache\s*?(?:,|$)/;

function destroyStream(stream: ReadStream, suppress: boolean): void {
  if (typeof stream.destroy === "function") {
    stream.destroy();
  }

  if (typeof stream.close === "function") {
    // Node.js core bug workaround
    stream.on("open", function onOpenClose(this: ReadStream) {
      if (typeof (this as any).fd === "number") {
        // actually close down the fd
        this.close();
      }
    });
  }

  if (typeof stream.addListener === "function" && suppress) {
    stream.removeAllListeners("error");
    stream.addListener("error", () => {});
  }
}

const statuses: Record<number, string> = {
  400: "Bad Request",
  403: "Forbidden",
  404: "Not Found",
  416: "Range Not Satisfiable",
  500: "Internal Server Error",
};

const parseRangeHeaders = memorize(
  /**
   * @param {string} value
   * @returns {Result | Ranges}
   */
  (value: string): Result | Ranges => {
    const [len, rangeHeader] = value.split("|");

    return require("range-parser")(Number(len), rangeHeader, {
      combine: true,
    });
  },
);

export function wrapper<
  Request extends IncomingMessage,
  Response extends ServerResponse,
>(context: FilledContext<Request, Response>): Middleware<Request, Response> {
  return async function middleware(req, res, next) {
    const acceptedMethods = ["GET", "HEAD"];

    // fixes #282. credit @cexoso. in certain edge situations res.locals is undefined.
    res.locals = res.locals || {};

    async function goNext() {
      return new Promise((resolve) => {
        ready(
          context,
          () => {
            (res as any).locals.webpack = { devMiddleware: context };

            resolve(next());
          },
          req,
        );
      });
    }

    if (req.method && !acceptedMethods.includes(req.method)) {
      await goNext();

      return;
    }

    /**
     * @param {number} status
     * @param {Partial<SendErrorOptions<Request, Response>>=} options
     * @returns {void}
     */
    function sendError(
      status: number,
      options?: Partial<SendErrorOptions<Request, Response>>,
    ): void {
      const content = statuses[status] || String(status);
      const document = Buffer.from(
        `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>${escapeHtml(content)}</pre>
</body>
</html>`,
        "utf-8",
      );

      // Clear existing headers
      const headers = res.getHeaderNames();

      for (let i = 0; i < headers.length; i++) {
        res.removeHeader(headers[i]);
      }

      if (options && options.headers) {
        const keys = Object.keys(options.headers);

        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          const value = options.headers[key];

          if (typeof value !== "undefined") {
            res.setHeader(key, value);
          }
        }
      }

      // Send basic response
      res.statusCode = status;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Security-Policy", "default-src 'none'");
      res.setHeader("X-Content-Type-Options", "nosniff");

      const byteLength = Buffer.byteLength(document);

      res.setHeader("Content-Length", byteLength);

      res.end(document);
    }

    function isConditionalGET() {
      return (
        req.headers["if-match"] ||
        req.headers["if-unmodified-since"] ||
        req.headers["if-none-match"] ||
        req.headers["if-modified-since"]
      );
    }

    function isPreconditionFailure() {
      // if-match
      const ifMatch = req.headers["if-match"];

      // A recipient MUST ignore If-Unmodified-Since if the request contains
      // an If-Match header field; the condition in If-Match is considered to
      // be a more accurate replacement for the condition in
      // If-Unmodified-Since, and the two are only combined for the sake of
      // interoperating with older intermediaries that might not implement If-Match.
      if (ifMatch) {
        const etag = res.getHeader("ETag");

        return (
          !etag ||
          (ifMatch !== "*" &&
            parseTokenList(ifMatch).every(
              (match) =>
                match !== etag &&
                match !== `W/${etag}` &&
                `W/${match}` !== etag,
            ))
        );
      }

      // if-unmodified-since
      const ifUnmodifiedSince = req.headers["if-unmodified-since"];

      if (ifUnmodifiedSince) {
        const unmodifiedSince = parseHttpDate(ifUnmodifiedSince);

        // A recipient MUST ignore the If-Unmodified-Since header field if the
        // received field-value is not a valid HTTP-date.
        if (!isNaN(unmodifiedSince)) {
          const lastModified = parseHttpDate(
            /** @type {string} */ res.getHeader("Last-Modified"),
          );

          return isNaN(lastModified) || lastModified > unmodifiedSince;
        }
      }

      return false;
    }

    /**
     * @returns {boolean} is cachable
     */
    function isCachable(): boolean {
      return (
        (res.statusCode >= 200 && res.statusCode < 300) ||
        res.statusCode === 304
      );
    }

    /**
     * @param {import("http").OutgoingHttpHeaders} resHeaders
     * @returns {boolean}
     */
    function isFresh(resHeaders: Record<string, string | undefined>): boolean {
      // Always return stale when Cache-Control: no-cache to support end-to-end reload requests
      // https://tools.ietf.org/html/rfc2616#section-14.9.4
      const cacheControl = req.headers["cache-control"];

      if (cacheControl && CACHE_CONTROL_NO_CACHE_REGEXP.test(cacheControl)) {
        return false;
      }

      // fields
      const noneMatch = req.headers["if-none-match"];
      const modifiedSince = req.headers["if-modified-since"];

      // unconditional request
      if (!noneMatch && !modifiedSince) {
        return false;
      }

      // if-none-match
      if (noneMatch && noneMatch !== "*") {
        if (!resHeaders.etag) {
          return false;
        }

        const matches = parseTokenList(noneMatch);

        let etagStale = true;

        for (let i = 0; i < matches.length; i++) {
          const match = matches[i];

          if (
            match === resHeaders.etag ||
            match === `W/${resHeaders.etag}` ||
            `W/${match}` === resHeaders.etag
          ) {
            etagStale = false;
            break;
          }
        }

        if (etagStale) {
          return false;
        }
      }

      // A recipient MUST ignore If-Modified-Since if the request contains an If-None-Match header field;
      // the condition in If-None-Match is considered to be a more accurate replacement for the condition in If-Modified-Since,
      // and the two are only combined for the sake of interoperating with older intermediaries that might not implement If-None-Match.
      if (noneMatch) {
        return true;
      }

      // if-modified-since
      if (modifiedSince) {
        const lastModified = resHeaders["last-modified"];

        //  A recipient MUST ignore the If-Modified-Since header field if the
        //  received field-value is not a valid HTTP-date, or if the request
        //  method is neither GET nor HEAD.
        const modifiedStale =
          !lastModified ||
          !(parseHttpDate(lastModified) <= parseHttpDate(modifiedSince));

        if (modifiedStale) {
          return false;
        }
      }

      return true;
    }

    function isRangeFresh(): boolean {
      const ifRange = req.headers["if-range"];

      if (!ifRange) {
        return true;
      }

      // if-range as etag
      if (ifRange.indexOf('"') !== -1) {
        const etag = res.getHeader("ETag");

        if (!etag) {
          return true;
        }

        return Boolean(etag && ifRange.indexOf(etag) !== -1);
      }

      // if-range as modified date
      const lastModified = res.getHeader("Last-Modified");

      if (!lastModified) {
        return true;
      }

      return parseHttpDate(lastModified) <= parseHttpDate(ifRange);
    }

    function getRangeHeader(): string | undefined {
      const range = req.headers.range;

      if (range && BYTES_RANGE_REGEXP.test(range)) {
        return range;
      }

      return undefined;
    }

    /**
     * @param {import("range-parser").Range} range
     * @returns {[number, number]}
     */
    function getOffsetAndLenFromRange(range: {
      start: number;
      end: number;
    }): [number, number] {
      const offset = range.start;
      const len = range.end - range.start + 1;

      return [offset, len];
    }

    /**
     * @param {number} offset
     * @param {number} len
     * @returns {[number, number]}
     */
    function calcStartAndEnd(offset: number, len: number): [number, number] {
      const start = offset;
      const end = Math.max(offset, offset + len - 1);

      return [start, end];
    }

    async function processRequest() {
      // Pipe and SendFile
      const extra: { errorCode?: number; stats?: import("fs").Stats } = {};
      const filename = getFilenameFromUrl(context, req.url as string, extra);

      if (extra.errorCode) {
        if (extra.errorCode === 403) {
          context.logger.error(`Malicious path "${filename}".`);
        }

        sendError(extra.errorCode);

        return;
      }

      if (!filename) {
        await goNext();

        return;
      }

      const { size } = extra.stats as import("fs").Stats;

      let len = size;
      let offset = 0;

      if (!res.getHeader("Content-Type")) {
        // content-type name(like text/javascript; charset=utf-8) or false
        const contentType = getContentType(filename);

        // Only set content-type header if media type is known
        // https://tools.ietf.org/html/rfc7231#section-3.1.1.5
        if (contentType) {
          res.setHeader("Content-Type", contentType);
        }
      }

      if (!res.getHeader("Accept-Ranges")) {
        res.setHeader("Accept-Ranges", "bytes");
      }

      if (context.options.lastModified && !res.getHeader("Last-Modified")) {
        const modified = (
          extra.stats as import("fs").Stats
        ).mtime.toUTCString();

        res.setHeader("Last-Modified", modified);
      }

      const rangeHeader = getRangeHeader();

      if (!res.getHeader("ETag")) {
        const value = extra.stats as import("fs").Stats;
        if (value) {
          const hash = await getEtag(value);
          res.setHeader("ETag", hash);
        }
      }

      // Conditional GET support
      if (isConditionalGET()) {
        if (isPreconditionFailure()) {
          sendError(412);

          return;
        }

        // For Koa
        if (res.statusCode === 404) {
          res.statusCode = 200;
        }

        if (
          isCachable() &&
          isFresh({
            etag: res.getHeader("ETag") as string,
            "last-modified": res.getHeader("Last-Modified") as string,
          })
        ) {
          res.statusCode = 304;

          // Remove content header fields
          res.removeHeader("Content-Encoding");
          res.removeHeader("Content-Language");
          res.removeHeader("Content-Length");
          res.removeHeader("Content-Range");
          res.removeHeader("Content-Type");
          res.end();

          return;
        }
      }

      if (rangeHeader) {
        let parsedRanges = parseRangeHeaders(`${size}|${rangeHeader}`);

        // If-Range support
        if (!isRangeFresh()) {
          parsedRanges = [];
        }

        if (parsedRanges === -1) {
          context.logger.error("Unsatisfiable range for 'Range' header.");

          res.setHeader(
            "Content-Range",
            getValueContentRangeHeader("bytes", size),
          );

          sendError(416, {
            headers: {
              "Content-Range": res.getHeader("Content-Range"),
            },
          });

          return;
        } else if (parsedRanges === -2) {
          context.logger.error(
            "A malformed 'Range' header was provided. A regular response will be sent for this request.",
          );
        } else if (parsedRanges.length > 1) {
          context.logger.error(
            "A 'Range' header with multiple ranges was provided. Multiple ranges are not supported, so a regular response will be sent for this request.",
          );
        }

        if (parsedRanges !== -2 && parsedRanges.length === 1) {
          res.statusCode = 206;
          res.setHeader(
            "Content-Range",
            getValueContentRangeHeader(
              "bytes",
              size,
              parsedRanges[0] as import("range-parser").Ranges,
            ),
          );

          [offset, len] = getOffsetAndLenFromRange(
            parsedRanges[0] as import("range-parser").Range,
          );
        }
      }

      let bufferOrStream: undefined | Buffer | ReadStream;
      let byteLength: number;

      const [start, end] = calcStartAndEnd(offset, len);

      try {
        ({ bufferOrStream, byteLength } = createReadStreamOrReadFileSync(
          filename,
          context.outputFileSystem,
          start,
          end,
        ));
      } catch (_ignoreError) {
        await goNext();
        return;
      }

      res.setHeader("Content-Length", byteLength);

      if (req.method === "HEAD") {
        if (res.statusCode === 404) {
          res.statusCode = 200;
        }

        res.end();
        return;
      }

      const isPipeSupports =
        typeof (bufferOrStream as ReadStream).pipe === "function";

      if (!isPipeSupports) {
        res.end(bufferOrStream as Buffer);
        return;
      }

      const cleanup = () => {
        destroyStream(bufferOrStream as ReadStream, true);
      };

      (bufferOrStream as ReadStream).on("error", (error) => {
        cleanup();

        switch (error.code) {
          case "ENAMETOOLONG":
          case "ENOENT":
          case "ENOTDIR":
            sendError(404);
            break;
          default:
            sendError(500);
            break;
        }
      });

      (bufferOrStream as ReadStream).pipe(res);

      onFinishedStream(res, cleanup);
    }

    ready(context, processRequest, req);
  };
}

module.exports = wrapper;
