#!/usr/bin/env node
/**
 * Copy the generated error-code pages into a LOCAL wcpos/docs checkout.
 *
 * Deliberately manual (owner ruling, 2026-08-12): the registry changes rarely
 * and there are only ~60 codes, so delivery is a human running this against a
 * sibling clone and opening a normal PR — no cross-repo tokens, no bot PRs.
 *
 *   pnpm sync:error-docs ../docs        # or wherever the wcpos/docs clone is
 *
 * What it does:
 *   1. copies packages/utils/src/logger/generated/error-docs/*.mdx into
 *      versioned_docs/version-1.x/error-codes/
 *   2. deletes previously-synced pages whose code left the registry
 *      (identified by the GENERATED banner — hand-written legacy pages are
 *      never touched)
 *   3. splices the generated sidebar category into
 *      versioned_sidebars/version-1.x-sidebars.json
 *
 * Review the diff in the docs clone and open the PR yourself. CI reminds you
 * when the live site is missing a page: scripts/check-error-docs-lockstep.mjs.
 */
import { copyFile, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BANNER =
	'GENERATED PAGE — do not edit. Source of truth: packages/utils/src/logger/error-registry.json';
const sourceDir = fileURLToPath(
	new URL('../packages/utils/src/logger/generated/error-docs/', import.meta.url),
);

const docsRoot = process.argv[2];
if (!docsRoot) {
	console.error('Usage: pnpm sync:error-docs <path-to-wcpos-docs-clone>');
	process.exit(1);
}
const targetDir = path.resolve(docsRoot, 'versioned_docs/version-1.x/error-codes');

const sourcePages = (await readdir(sourceDir)).filter((f) => f.endsWith('.mdx'));
const sourceSet = new Set(sourcePages);

let removed = 0;
for (const existing of await readdir(targetDir)) {
	if (!existing.endsWith('.mdx') || sourceSet.has(existing)) continue;
	const body = await readFile(path.join(targetDir, existing), 'utf8');
	if (!body.includes(BANNER)) continue; // hand-written legacy page — keep
	await rm(path.join(targetDir, existing));
	removed += 1;
}

for (const page of sourcePages) {
	await copyFile(path.join(sourceDir, page), path.join(targetDir, page));
}

const { execFileSync } = await import('node:child_process');
execFileSync(process.execPath, [
	fileURLToPath(new URL('./splice-error-docs-sidebar.mjs', import.meta.url)),
	path.resolve(docsRoot),
]);

console.log(
	`Synced ${sourcePages.length} page(s) to ${targetDir}${removed ? `, removed ${removed} stale` : ''}, sidebar spliced.`,
);
console.log('Review the diff in the docs clone and open a PR.');
