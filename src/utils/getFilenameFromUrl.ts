import path from "path";
import { parse, UrlWithStringQuery } from "url";
import querystring from "querystring";
import { getPaths } from "./getPaths";
import { memorize } from "./memorize";
import { IncomingMessage, ServerResponse, FilledContext } from "../index";
import { Stats } from "fs";

// eslint-disable-next-line no-undefined
const memoizedParse = memorize(
  parse,
  undefined,
  (value: UrlWithStringQuery) => {
    if (value.pathname) {
      // eslint-disable-next-line no-param-reassign
      value.pathname = decode(value.pathname);
    }

    return value;
  },
);

const UP_PATH_REGEXP = /(?:^|[\\/])\.\.(?:[\\/]|$)/;

/**
 * @typedef {Object} Extra
 * @property {Stats=} stats
 * @property {number=} errorCode
 */

/**
 * decodeURIComponent.
 *
 * Allows V8 to only deoptimize this fn instead of all of send().
 *
 * @param {string} input
 * @returns {string}
 */

function decode(input: string): string {
  return querystring.unescape(input);
}

export type Extra = { stats?: Stats; errorCode?: number };

// TODO refactor me in the next major release, this function should return `{ filename, stats, error }`
// TODO fix redirect logic when `/` at the end, like https://github.com/pillarjs/send/blob/master/index.js#L586
export function getFilenameFromUrl<
  Request extends IncomingMessage,
  Response extends ServerResponse,
>(
  context: FilledContext<Request, Response>,
  url: string,
  extra: Extra = {},
): string | undefined {
  const { options } = context;
  const paths = getPaths(context);

  let foundFilename: string | undefined;
  let urlObject: UrlWithStringQuery;

  try {
    // The `url` property of the `request` is contains only  `pathname`, `search` and `hash`
    urlObject = memoizedParse(url, false, true);
  } catch (_ignoreError) {
    return;
  }

  for (const { publicPath, outputPath } of paths) {
    let filename: string | undefined;
    let publicPathObject: UrlWithStringQuery;

    try {
      publicPathObject = memoizedParse(
        publicPath !== "auto" && publicPath ? publicPath : "/",
        false,
        true,
      );
    } catch (_ignoreError) {
      // eslint-disable-next-line no-continue
      continue;
    }

    const { pathname } = urlObject;
    const { pathname: publicPathPathname } = publicPathObject;

    if (
      pathname &&
      publicPathPathname &&
      pathname.startsWith(publicPathPathname)
    ) {
      // Null byte(s)
      if (pathname.includes("\0")) {
        // eslint-disable-next-line no-param-reassign
        extra.errorCode = 400;

        return;
      }

      // ".." is malicious
      if (UP_PATH_REGEXP.test(path.normalize(`./${pathname}`))) {
        // eslint-disable-next-line no-param-reassign
        extra.errorCode = 403;

        return;
      }

      // Strip the `pathname` property from the `publicPath` option from the start of requested url
      // `/complex/foo.js` => `foo.js`
      // and add outputPath
      // `foo.js` => `/home/user/my-project/dist/foo.js`
      filename = path.join(
        outputPath,
        pathname.slice(publicPathPathname.length),
      );

      try {
        extra.stats = context.outputFileSystem.statSync?.(filename) as Stats;
      } catch (_ignoreError) {
        // eslint-disable-next-line no-continue
        continue;
      }

      if (extra.stats.isFile()) {
        foundFilename = filename;
        break;
      } else if (
        extra.stats.isDirectory() &&
        (typeof options.index === "undefined" || options.index)
      ) {
        const indexValue =
          typeof options.index === "undefined" ||
          typeof options.index === "boolean"
            ? "index.html"
            : options.index;

        filename = path.join(filename, indexValue);

        try {
          extra.stats = context.outputFileSystem.statSync?.(filename) as Stats;
        } catch (__ignoreError) {
          // eslint-disable-next-line no-continue
          continue;
        }

        if (extra.stats.isFile()) {
          foundFilename = filename;
          break;
        }
      }
    }
  }

  // eslint-disable-next-line consistent-return
  return foundFilename;
}
