import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { patchOpfsWorker } from "./patch-opfs-worker.mjs";

const patcher = fileURLToPath(
  new URL("./patch-opfs-worker.mjs", import.meta.url),
);
const shippedWorker = new URL(
  "../apps/main/public/opfs.worker.js",
  import.meta.url,
);

test("patched OPFS worker completes partial writes without duplicating the shim", () => {
  const directory = mkdtempSync(join(tmpdir(), "wcpos-opfs-worker-"));
  const workerPath = join(directory, "opfs.worker.js");
  writeFileSync(workerPath, "self.vendorWorkerLoaded = true;\n");

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = spawnSync(process.execPath, [patcher, workerPath], {
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
  const result = spawnSync(process.execPath, [patcher, workerPath], {
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

test("patcher runs when invoked through a symlink", () => {
  const directory = mkdtempSync(join(tmpdir(), "wcpos-opfs-worker-"));
  const workerPath = join(directory, "opfs.worker.js");
  const symlinkPath = join(directory, "patch-opfs-worker.mjs");
  writeFileSync(workerPath, "self.vendorWorkerLoaded = true;\n");
  symlinkSync(patcher, symlinkPath);

  const result = spawnSync(process.execPath, [symlinkPath, workerPath], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(workerPath, "utf8"), /WCPOS_OPFS_COMPLETE_WRITES/);
});

test("patched worker tolerates scopes without sync access handles", () => {
  for (const FileSystemSyncAccessHandle of [undefined, class {}]) {
    const self = {};
    vm.runInNewContext(patchOpfsWorker("self.vendorWorkerLoaded = true;\n"), {
      self,
      FileSystemSyncAccessHandle,
      ArrayBuffer,
      Uint8Array,
      Error,
    });
    assert.equal(self.vendorWorkerLoaded, true);
  }
});

test("patched worker preserves native option and empty-write semantics", () => {
  const calls = [];
  class FakeAccessHandle {}
  FakeAccessHandle.prototype.write = function (buffer, options) {
    calls.push({ at: options?.at, length: buffer.byteLength });
    return buffer.byteLength === 0
      ? 0
      : Math.max(1, Math.floor(buffer.byteLength / 2));
  };
  vm.runInNewContext(patchOpfsWorker(""), {
    FileSystemSyncAccessHandle: FakeAccessHandle,
    Uint8Array,
    ArrayBuffer,
    Error,
  });

  const handle = new FakeAccessHandle();
  assert.equal(handle.write(new Uint8Array(0), { at: 20 }), 0);
  assert.equal(handle.write(new Uint8Array(4), { at: "8" }), 4);
  assert.equal(handle.write(new Uint8Array(1), null), 1);
  assert.deepEqual(calls, [
    { at: 20, length: 0 },
    { at: 8, length: 4 },
    { at: 10, length: 2 },
    { at: 11, length: 1 },
    { at: undefined, length: 1 },
  ]);
});

test("patched worker rejects non-buffer inputs before native write", () => {
  let callCount = 0;
  class FakeAccessHandle {}
  FakeAccessHandle.prototype.write = () => {
    callCount += 1;
    return 1;
  };
  vm.runInNewContext(patchOpfsWorker(""), {
    FileSystemSyncAccessHandle: FakeAccessHandle,
    Uint8Array,
    ArrayBuffer,
    Error,
  });

  assert.throws(() => new FakeAccessHandle().write(4), /BufferSource/);
  assert.equal(callCount, 0);
});

test("shipped OPFS worker contains the complete-write shim exactly once", () => {
  const source = readFileSync(shippedWorker, "utf8");
  assert.equal(source.match(/WCPOS_OPFS_COMPLETE_WRITES/g)?.length, 1);
});

test("shipped OPFS worker contains targeted record recovery exactly once", () => {
  const source = readFileSync(shippedWorker, "utf8");
  assert.equal(source.match(/WCPOS_OPFS_TARGETED_RECOVERY/g)?.length, 1);
});
