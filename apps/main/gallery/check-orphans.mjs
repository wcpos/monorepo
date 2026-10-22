#!/usr/bin/env node
// The inventory is the baseline set: a story or component that silently disappears leaves
// orphaned PNGs behind, and an orphan fails the job (review, roadmap#355).
//
// Each gallery test writes the PNG names it shot to `.shots/<component>.json`. The shoot is
// split across workers and shards, so no one test sees every cell: this unions the lists
// (from every shard, downloaded into one directory in CI) and compares them to the baselines
// on disk. A PNG nobody shot is an orphan; a shot with no PNG is missing.
//
// Usage: node apps/main/gallery/check-orphans.mjs [shotsDir] [snapshotsDir]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shotsDir = resolve(process.argv[2] ?? join(here, '.shots'));
const snapshotsDir = resolve(process.argv[3] ?? join(here, 'gallery.spec.ts-snapshots'));

const lists = existsSync(shotsDir)
	? readdirSync(shotsDir).filter((name) => name.endsWith('.json'))
	: [];
if (!lists.length) {
	console.error(`No shot lists in ${shotsDir}: run the gallery shoot first.`);
	process.exit(1);
}
const shot = new Set(
	lists.flatMap((name) => JSON.parse(readFileSync(join(shotsDir, name), 'utf8')))
);
const onDisk = new Set(readdirSync(snapshotsDir).filter((name) => name.endsWith('.png')));

const orphans = [...onDisk].filter((name) => !shot.has(name)).sort();
const missing = [...shot].filter((name) => !onDisk.has(name)).sort();
if (orphans.length || missing.length) {
	if (orphans.length)
		console.error(`Orphaned baselines (no test shot them):\n  ${orphans.join('\n  ')}`);
	if (missing.length)
		console.error(`Missing baselines (shot, not on disk):\n  ${missing.join('\n  ')}`);
	process.exit(1);
}
console.log(
	`Gallery baselines match the shoot: ${shot.size} cells from ${lists.length} components.`
);
