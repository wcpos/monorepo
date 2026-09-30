import { copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

await build({
	entryPoints: [fileURLToPath(new URL('./sqlite-worker-entry.mjs', import.meta.url))],
	outfile: fileURLToPath(new URL('../apps/main/public/sqlite.worker.js', import.meta.url)),
	format: 'esm',
	platform: 'browser',
	bundle: true,
	minify: true,
	legalComments: 'none',
	banner: { js: '/* WCPOS_SQLITE_WORKER */' },
});
await copyFile(
	new URL(import.meta.resolve('@sqlite.org/sqlite-wasm/sqlite3.wasm')),
	new URL('../apps/main/public/sqlite3.wasm', import.meta.url)
);
