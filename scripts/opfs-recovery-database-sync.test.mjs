import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("database recovery module matches the source script byte-for-byte", async () => {
  const source = await readFile(
    new URL("./opfs-targeted-recovery.mjs", import.meta.url),
  );
  const databaseCopy = await readFile(
    new URL(
      "../packages/database/src/plugins/opfs-targeted-recovery.mjs",
      import.meta.url,
    ),
  );

  assert.deepEqual(databaseCopy, source);
});
