/**
 * Skip stock-only re-indexing and explicitly replace changed searchable text.
 * Digests retain no searchable text and grow with document count, not writes.
 * This does not compact append history or FlexSearch's empty token keys.
 *
 * Why not `pnpm patch`: rxdb-premium's dist/ is materialized by its own
 * license-gated postinstall, so it does not exist in the tarball pnpm patches.
 * This repo postinstall patch is idempotent and fails the install if an anchor
 * moves; re-derive it against the churn tests on an upgrade.
 */
import { existsSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const MARKER = '__wcposIndexSearchText';

// ES5-safe: this exact function's source is prepended to both installed dists.
/* eslint-disable no-var */
export function indexSearchText(index, id, searchable) {
	var digests = index.__wcposSearchDigests || (index.__wcposSearchDigests = new Map());
	var hash = 0;
	for (var i = 0; i < searchable.length; i++) {
		hash = ((hash << 5) - hash + searchable.charCodeAt(i)) | 0;
	}
	var digest = searchable.length + ':' + hash;
	if (digests.get(id) === digest) return;
	if (digests.has(id) && typeof index.update === 'function') {
		index.update(id, searchable);
	} else {
		if (digests.has(id) && typeof index.remove === 'function') index.remove(id);
		index.add(id, searchable);
	}
	digests.set(id, digest);
}
/* eslint-enable no-var */

export const PRELUDE = `globalThis.WCPOS_FLEXSEARCH_CHURN_PATCH=1;\n${indexSearchText
	.toString()
	.replace('function indexSearchText(', `function ${MARKER}(`)}\n`;

// Byte-exact per-dist literals: keep everything outside these rewrites untouched.
// These installed dists have two indexing add sites: boot replay and live events.
export const DISTS = [
	{ dist: 'esm', liveBefore: 's.add(e.id,e.searchable)', replayBefore: 'o.add(e.id,e.searchable)' },
	{ dist: 'cjs', liveBefore: 'n.add(e.id,e.searchable)', replayBefore: 'l.add(e.id,e.searchable)' },
].map(({ dist, liveBefore, replayBefore }) => ({
	dist,
	liveBefore,
	liveAfter: `${MARKER}(${liveBefore[0]},e.id,e.searchable)`,
	replayBefore,
	replayAfter: `${MARKER}(${replayBefore[0]},e.id,e.searchable)`,
	closeBefore: 'this.subs.forEach((e=>e.unsubscribe())),await this.queue}',
	closeAfter:
		'this.subs.forEach((e=>e.unsubscribe())),await this.queue,this.index.__wcposSearchDigests&&this.index.__wcposSearchDigests.clear()}',
}));

// Validate every dist before writing any, as in the changelog-identity patcher.
export function preparePatch(path, anchors) {
	const source = readFileSync(path, 'utf8');
	const keys = Object.keys(anchors)
		.filter((key) => key.endsWith('Before'))
		.map((key) => key.slice(0, -6));
	if (source.includes(MARKER)) {
		for (const key of keys) {
			if (!source.includes(anchors[`${key}After`])) {
				throw new Error(
					`${path} carries the patch marker but rewrite ${key} is missing — ` +
						'the patched file is incomplete; reinstall rxdb-premium to restore a pristine dist'
				);
			}
		}
		if (!source.includes(PRELUDE)) {
			throw new Error(
				`${path} carries the patch marker but an outdated prelude — reinstall rxdb-premium so postinstall can re-apply the current patch`
			);
		}
		return { path, status: 'already patched' };
	}
	for (const key of keys) {
		const occurrences = source.split(anchors[`${key}Before`]).length - 1;
		if (occurrences !== 1) {
			throw new Error(
				`anchor ${key}Before matched ${occurrences} times in ${path} (expected exactly 1) — ` +
					'rxdb-premium changed; re-derive this patch against the churn test'
			);
		}
	}
	let next = PRELUDE + source;
	for (const key of keys) {
		next = next.replace(anchors[`${key}Before`], anchors[`${key}After`]);
	}
	for (const key of keys) {
		if (!next.includes(anchors[`${key}After`])) {
			throw new Error(
				`rewrite ${key} did not apply in ${path} — re-derive this patch against the churn test`
			);
		}
	}
	return { path, next, status: 'patched' };
}

function commitPatches(prepared) {
	for (const { path, next } of prepared) {
		if (next === undefined) continue;
		const temporaryPath = `${path}.${process.pid}.tmp`;
		writeFileSync(temporaryPath, next);
		renameSync(temporaryPath, path);
	}
}

function main() {
	const packageRoot = dirname(require.resolve('rxdb-premium/package.json'));
	const prepared = DISTS.map(({ dist, ...anchors }) => {
		const path = join(packageRoot, `dist/${dist}/plugins/flexsearch/rx-fulltext-search.js`);
		if (!existsSync(path)) {
			throw new Error(`rxdb-premium ${dist} dist not found — run after the package postinstall`);
		}
		return { dist, ...preparePatch(path, anchors) };
	});
	commitPatches(prepared);
	console.log(
		`[patch-rxdb-premium-flexsearch-churn] ${prepared
			.map(({ dist, status }) => `${dist}: ${status}`)
			.join(', ')}`
	);
}

// Importing the test seam must not patch node_modules.
if (
	process.argv[1] &&
	realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
	main();
}
