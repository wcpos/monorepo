/**
 * Skip append writes and re-indexing for text the index already holds.
 * The map holds each document's EXACT searchable text under a hard ceiling on entries and
 * retained bytes, because nothing can prune it by id and a churning collection would
 * otherwise keep an entry per row ever seen; a 32-bit digest was tried first and rejected because
 * it collides ('AaAa' and 'BBBB' agree), and a collision here silently freezes that
 * document's search results.
 * This does not compact existing append history or FlexSearch's empty token keys.
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

// ES5-safe: these functions' sources are prepended to both installed dists.
/* eslint-disable no-var */
function wcposSearchDigest(searchable) {
	// The EXACT text, not a hash. A 32-bit hash collides in practice ('AaAa' and 'BBBB'
	// both give 4:2031744), and a collision here is silent and permanent: the document's
	// text changes, the update is skipped, and its search results are wrong until something
	// else rebuilds the index. Memory stays bounded by document count, which is the property
	// that mattered; a catalogue of 5,000 titles is a few hundred kilobytes.
	return searchable;
}

function wcposByteLength(text) {
	// UTF-8 bytes, not UTF-16 code units: `.length` undercounts by up to 3x, which would let
	// non-Latin text hold three times the advertised ceiling. Counted rather than encoded so
	// the hot path allocates nothing.
	var bytes = 0;
	for (var i = 0; i < text.length; i++) {
		var code = text.charCodeAt(i);
		if (code < 128) bytes += 1;
		else if (code < 2048) bytes += 2;
		else if (code >= 55296 && code <= 56319) {
			// A surrogate PAIR is 4 bytes; a lone surrogate encodes as the 3-byte replacement.
			if (i + 1 < text.length) {
				var next = text.charCodeAt(i + 1);
				if (next >= 56320 && next <= 57343) {
					bytes += 4;
					i++;
					continue;
				}
			}
			bytes += 3;
		} else bytes += 3;
	}
	return bytes;
}

function wcposRetainDigest(index, digests, id, digest) {
	// The plugin never observes deletions, so nothing here can prune a single id. A
	// collection that churns therefore keeps an entry per row EVER seen rather than per row
	// present. `logs` does exactly that: its retention sweep removes rows while its
	// searchFields cover message and error text, and since the collision fix each entry
	// holds that exact text rather than a small number.
	//
	// Forgetting is always safe. A missing entry only means the next write re-indexes, which
	// is what the unpatched plugin did every time anyway, so the bound costs correctness
	// nothing and buys a ceiling. Cleared wholesale rather than evicted one at a time: an LRU
	// is more machinery than a cache whose miss is this cheap deserves.
	var bytes = index.__wcposDigestBytes || 0;
	var previous = digests.get(id);
	if (previous !== undefined) bytes -= wcposByteLength(previous);
	var size = wcposByteLength(digest);
	// A single value past the whole ceiling is never retained: caching it would leave the
	// tally above the bound this advertises. `logs.message` has no schema length limit, so
	// one large error can be that value. Not caching costs one re-index of that document.
	if (size > 2097152) {
		digests.clear();
		index.__wcposDigestBytes = 0;
		return;
	}
	// The entry ceiling applies to GROWTH only. Replacing an id already held does not add an
	// entry, and clearing there would forget the other 19,999 on a full catalogue because one
	// title changed — re-indexing everything, which is the churn this exists to stop.
	if ((previous === undefined && digests.size >= 20000) || bytes + size > 2097152) {
		digests.clear();
		bytes = 0;
	}
	digests.set(id, digest);
	index.__wcposDigestBytes = bytes + size;
}

export function indexSearchText(index, id, searchable) {
	var digests = index.__wcposSearchDigests || (index.__wcposSearchDigests = new Map());
	var digest = wcposSearchDigest(searchable);
	if (digests.get(id) === digest) return;
	if (digests.has(id) && typeof index.update === 'function') {
		index.update(id, searchable);
	} else {
		if (digests.has(id) && typeof index.remove === 'function') index.remove(id);
		index.add(id, searchable);
	}
	wcposRetainDigest(index, digests, id, digest);
}

export function wcposChangedSearchEntries(index, entries) {
	// Every mapped id was indexed from already persisted or appended data: skipping is safe.
	// Snapshot-restored indexes start with an empty map, so the first update still appends
	// once per document even if unchanged. That document-count-bounded overhead is acceptable.
	// Only indexing updates the map; filtering must not advance it before persistence.
	// A batch can carry the same document twice. Compare only its LAST entry: every earlier
	// one is superseded, and persisting a superseded entry would leave the history claiming
	// text the document no longer has, which replay would then load into the index.
	var digests = index.__wcposSearchDigests;
	var last = new Map();
	entries.forEach(function (entry, position) {
		last.set(entry.id, position);
	});
	return entries.filter(function (entry, position) {
		if (last.get(entry.id) !== position) return false;
		return !digests || digests.get(entry.id) !== wcposSearchDigest(entry.searchable);
	});
}
/* eslint-enable no-var */

export const PRELUDE = `globalThis.WCPOS_FLEXSEARCH_CHURN_PATCH=1;\n${wcposSearchDigest.toString()}\n${wcposByteLength.toString()}\n${wcposRetainDigest.toString()}\n${wcposChangedSearchEntries.toString().replace(/^export /, '')}\n${indexSearchText
	.toString()
	.replace('function indexSearchText(', `function ${MARKER}(`)}\n`;

// Byte-exact per-dist literals: keep everything outside these rewrites untouched.
// These installed dists have two indexing add sites: boot replay and live events.
export const DISTS = [
	{
		dist: 'esm',
		liveBefore: 's.add(e.id,e.searchable)',
		replayBefore: 'o.add(e.id,e.searchable)',
		pipelineBefore: 'l=await a.collection.addPipeline({destination:s,',
		destination: 's',
		appendBefore: 'i.push({id:o,searchable:r})}var l=',
	},
	{
		dist: 'cjs',
		liveBefore: 'n.add(e.id,e.searchable)',
		replayBefore: 'l.add(e.id,e.searchable)',
		pipelineBefore: 'h=await e.collection.addPipeline({destination:c,',
		destination: 'c',
		appendBefore: 'i.push({id:s,searchable:n})}var o=',
	},
].map(({ dist, liveBefore, replayBefore, pipelineBefore, appendBefore, destination }) => ({
	dist,
	liveBefore,
	liveAfter: `${MARKER}(${liveBefore[0]},e.id,e.searchable)`,
	replayBefore,
	replayAfter: `${MARKER}(${replayBefore[0]},e.id,e.searchable)`,
	// Both handlers shadow the index variable; bind it to their destination instead.
	pipelineBefore,
	pipelineAfter: pipelineBefore.replace(
		`destination:${destination},`,
		`destination:(${destination}.__wcposAppendIndex=${replayBefore[0]},${destination}),`
	),
	appendBefore,
	appendAfter: appendBefore.replace(
		'}var ',
		`}i=wcposChangedSearchEntries(${destination}.__wcposAppendIndex,i);if(!i.length)return;var `
	),
	closeBefore: 'this.subs.forEach((e=>e.unsubscribe())),await this.queue}',
	closeAfter:
		'this.subs.forEach((e=>e.unsubscribe())),await this.queue,this.index.__wcposSearchDigests&&this.index.__wcposSearchDigests.clear(),this.index.__wcposDigestBytes=0}',
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
