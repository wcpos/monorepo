import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const patcher = new URL("./patch-opfs-worker.mjs", import.meta.url);
const shippedWorker = new URL(
  "../apps/main/public/opfs.worker.js",
  import.meta.url,
);

test("patched OPFS worker completes partial writes without duplicating the shim", () => {
  const directory = mkdtempSync(join(tmpdir(), "wcpos-opfs-worker-"));
  const workerPath = join(directory, "opfs.worker.js");
  writeFileSync(workerPath, "self.vendorWorkerLoaded = true;\n");

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = spawnSync(process.execPath, [patcher.pathname, workerPath], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
  }

  const source = readFileSync(workerPath, "utf8");
  assert.equal(source.match(/WCPOS_OPFS_COMPLETE_WRITES/g)?.length, 1);

  const calls = [];
  class FakeAccessHandle {}
  FakeAccessHandle.prototype.write = function (buffer, options = {}) {
    calls.push({ at: options.at, length: buffer.byteLength });
    return Math.max(1, Math.floor(buffer.byteLength / 2));
  };

  vm.runInNewContext(source, {
    self: {},
    FileSystemSyncAccessHandle: FakeAccessHandle,
    Uint8Array,
    ArrayBuffer,
    Error,
  });

  const handle = new FakeAccessHandle();
  assert.equal(handle.write(new Uint8Array(8), { at: 10 }), 8);
  assert.deepEqual(calls, [
    { at: 10, length: 8 },
    { at: 14, length: 4 },
    { at: 16, length: 2 },
    { at: 17, length: 1 },
  ]);
});

test("patched OPFS worker rejects invalid native write progress", () => {
  const directory = mkdtempSync(join(tmpdir(), "wcpos-opfs-worker-"));
  const workerPath = join(directory, "opfs.worker.js");
  writeFileSync(workerPath, "self.vendorWorkerLoaded = true;\n");
  const result = spawnSync(process.execPath, [patcher.pathname, workerPath], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);

  class FakeAccessHandle {}
  FakeAccessHandle.prototype.write = () => 99;
  vm.runInNewContext(readFileSync(workerPath, "utf8"), {
    self: {},
    FileSystemSyncAccessHandle: FakeAccessHandle,
    Uint8Array,
    ArrayBuffer,
    Error,
  });

  const handle = new FakeAccessHandle();
  assert.throws(() => handle.write(new Uint8Array(8)), /invalid progress/);
});

test("shipped OPFS worker contains the complete-write shim exactly once", () => {
  const source = readFileSync(shippedWorker, "utf8");
  assert.equal(source.match(/WCPOS_OPFS_COMPLETE_WRITES/g)?.length, 1);
});
