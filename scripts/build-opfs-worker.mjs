import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

import { patchOpfsWorker } from "./patch-opfs-worker.mjs";

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(
  process.argv[2] ??
    resolve(scriptsDirectory, "../apps/main/public/opfs.worker.js"),
);
const result = await build({
  entryPoints: [resolve(scriptsDirectory, "opfs-worker-entry.mjs")],
  bundle: true,
  format: "iife",
  legalComments: "none",
  minify: true,
  platform: "browser",
  write: false,
  banner: { js: "/* WCPOS_OPFS_TARGETED_RECOVERY */" },
});

const bundled = result.outputFiles[0].text.replace(/[ \t]+$/gm, "");
writeFileSync(outputPath, patchOpfsWorker(bundled));
