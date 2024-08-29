import { Stats } from "fs";
import { ReadStream } from "fs";
import mrmime from "mrmime";

/**
 * Create a simple ETag.
 */
export async function getEtag(stat: Stats): Promise<string> {
  const mtime = stat.mtime.getTime().toString(16);
  const size = stat.size.toString(16);

  return `W/"${size}-${mtime}"`;
}

export function createReadStreamOrReadFileSync(
  filename: string,
  outputFileSystem: {
    createReadStream: (
      path: string,
      options: { start: number; end: number },
    ) => Buffer | ReadStream;
  },
  start: number,
  end: number,
): { bufferOrStream: Buffer | ReadStream; byteLength: number } {
  const bufferOrStream = outputFileSystem.createReadStream(filename, {
    start,
    end,
  });
  // Handle files with zero bytes
  const byteLength = end === 0 ? 0 : end - start + 1;

  return { bufferOrStream, byteLength };
}

/**
 * Create a full Content-Type header given a MIME type or extension.
 */
export function getContentType(str: string): false | string {
  let mime = mrmime.lookup(str);
  if (!mime) {
    return false;
  }
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/manifest+json"
  ) {
    mime += `; charset=utf-8`;
  }
  return mime;
}
