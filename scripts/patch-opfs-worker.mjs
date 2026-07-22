import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MARKER = "WCPOS_OPFS_COMPLETE_WRITES";

const WRITE_ALL_SHIM = `/* ${MARKER} */
(() => {
  const nativeWrite = FileSystemSyncAccessHandle.prototype.write;
  FileSystemSyncAccessHandle.prototype.write = function (buffer, options = {}) {
    const bytes = ArrayBuffer.isView(buffer)
      ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      : new Uint8Array(buffer);
    let total = 0;
    while (total < bytes.byteLength) {
      const remaining = bytes.byteLength - total;
      const nextOptions = typeof options.at === 'number'
        ? { ...options, at: options.at + total }
        : options;
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
    writeFileSync(path, patchOpfsWorker(source));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2));
}
