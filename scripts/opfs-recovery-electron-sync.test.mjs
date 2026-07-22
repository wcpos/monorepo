import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// The Electron main process wraps getRxStorageFilesystemNode with the same
// targeted recovery module the web OPFS worker uses (the two storages share
// the abstract-filesystem on-disk format). The monorepo is the source of
// truth; the Electron repo carries byte-identical copies. This test pins the
// pinned apps/electron submodule commit to the monorepo sources: editing the
// wrapper here fails until the Electron copy ships and the submodule pointer
// is bumped alongside it.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const SYNCED_FILES = [
  [
    "scripts/opfs-targeted-recovery.mjs",
    "apps/electron/src/main/opfs-targeted-recovery.mjs",
  ],
  [
    "scripts/opfs-targeted-recovery.test.mjs",
    "apps/electron/src/main/opfs-targeted-recovery.test.mjs",
  ],
];

const submoduleInitialized = existsSync(
  join(repoRoot, "apps/electron/package.json"),
);

// CI initializes the submodule (test.yml lint job), so the skip only applies
// to local checkouts that never ran `git submodule update --init apps/electron`.
test(
  "electron carries byte-identical copies of the OPFS recovery module",
  {
    skip: submoduleInitialized
      ? false
      : "apps/electron submodule not initialized",
  },
  async () => {
    for (const [sourcePath, copyPath] of SYNCED_FILES) {
      const source = await readFile(join(repoRoot, sourcePath));
      assert.ok(
        existsSync(join(repoRoot, copyPath)),
        `${copyPath} is missing — copy ${sourcePath} into the wcpos/electron repo and bump the submodule pointer`,
      );
      const copy = await readFile(join(repoRoot, copyPath));
      assert.ok(
        source.equals(copy),
        `${copyPath} differs from ${sourcePath} — the monorepo is the source of truth; ` +
          `copy the file into the wcpos/electron repo and bump the apps/electron submodule pointer`,
      );
    }
  },
);
