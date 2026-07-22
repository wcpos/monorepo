import { readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MARKER = "WCPOS_OPFS_COMPLETE_WRITES";

const WRITE_ALL_SHIM = `/* ${MARKER} */
(() => {
  if (typeof FileSystemSyncAccessHandle === 'undefined'
      || typeof FileSystemSyncAccessHandle.prototype?.write !== 'function') return;
  const nativeWrite = FileSystemSyncAccessHandle.prototype.write;
  FileSystemSyncAccessHandle.prototype.write = function (buffer, options = {}) {
    const isSharedBuffer = typeof SharedArrayBuffer !== 'undefined'
      && buffer instanceof SharedArrayBuffer;
    if (!ArrayBuffer.isView(buffer) && !(buffer instanceof ArrayBuffer) && !isSharedBuffer) {
      throw new TypeError('OPFS write requires a BufferSource');
    }
    const bytes = ArrayBuffer.isView(buffer)
      ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      : new Uint8Array(buffer);
    const normalizedOptions = options == null ? {} : options;
    const at = normalizedOptions.at;
    const writeOptions = at === undefined
      ? normalizedOptions
      : { ...normalizedOptions, at: Number(at) };
    if (bytes.byteLength === 0) return nativeWrite.call(this, buffer, writeOptions);
    let total = 0;
    while (total < bytes.byteLength) {
      const remaining = bytes.byteLength - total;
      const nextOptions = typeof writeOptions.at === 'number'
        ? { ...writeOptions, at: writeOptions.at + total }
        : writeOptions;
      const written = nativeWrite.call(this, bytes.subarray(total), nextOptions);
      if (!Number.isSafeInteger(written) || written <= 0 || written > remaining) {
        throw new Error('OPFS write made invalid progress: ' + written + '/' + remaining);
      }
      total += written;
    }
    return total;
  };
})();
`;

export function patchOpfsWorker(source) {
  return source.includes(MARKER) ? source : WRITE_ALL_SHIM + source;
}

function main(paths) {
  if (paths.length === 0) {
    throw new Error(
      "Usage: node scripts/patch-opfs-worker.mjs <worker-path> [...]",
    );
  }

  for (const path of paths) {
    const source = readFileSync(path, "utf8");
    const temporaryPath = `${path}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, patchOpfsWorker(source));
    renameSync(temporaryPath, path);
  }
}

if (
  process.argv[1] &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  main(process.argv.slice(2));
}
