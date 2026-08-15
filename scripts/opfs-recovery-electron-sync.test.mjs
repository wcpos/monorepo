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

// CI enforces via a dedicated lint-job step that initializes the submodule and
// runs this file with REQUIRE_ELECTRON_SUBMODULE=1 (so a failed init cannot
// turn into a silent skip). The submodule must appear only after every pnpm
// command has run: once apps/electron/package.json exists, pnpm's deps-status
// check treats it as a workspace package missing from the CI-rewritten
// lockfile and aborts. The skip below applies to local checkouts that never
// ran `git submodule update --init apps/electron` — and to the test:scripts
// invocation in CI, which runs before the submodule is initialized.
const requireSubmodule = process.env.REQUIRE_ELECTRON_SUBMODULE === "1";
if (requireSubmodule) {
  assert.ok(
    submoduleInitialized,
    "REQUIRE_ELECTRON_SUBMODULE=1 but the apps/electron submodule is not initialized",
  );
}

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
