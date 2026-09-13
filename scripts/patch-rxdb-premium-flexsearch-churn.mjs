/**
 * Skip append writes and re-indexing for text the index already holds.
 * Each map holds exact searchable text (strong surrogates for oversized rows), bounded by entries and
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
	// Exact text normally; oversized rows use SHA-256 (FIPS 180-4) plus UTF-8 length.
	// For bounded JS strings its collision risk is negligible; a collision costs only one
	// stale search row. Escape literal descriptors so they cannot impersonate a large value.
	var bytes = wcposByteLength(searchable);
	if (bytes > 2097152) return '\0sha256:' + bytes + ':' + wcposSha256(searchable);
	if (searchable.charCodeAt(0) === 0) return '\0text:' + searchable;
	return searchable;
}

function wcposSha256(text) {
	// Hash UTF-16BE code units in fixed-size blocks, preserving even lone surrogates.
	var k = [
		0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
		0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
		0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
		0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
		0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
		0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
		0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
		0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
	];
	var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
	var words = new Array(64), blocks = Math.ceil((text.length * 2 + 9) / 64);
	function rotate(x, n) { return (x >>> n) | (x << (32 - n)); }
	for (var block = 0; block < blocks; block++) {
		for (var j = 0; j < 16; j++) {
			var position = block * 32 + j * 2;
			words[j] = ((text.charCodeAt(position) || 0) << 16) | (text.charCodeAt(position + 1) || 0);
			if (position === text.length) words[j] |= 0x80000000;
			if (position + 1 === text.length) words[j] |= 0x8000;
		}
		if (block === blocks - 1) {
			words[14] = Math.floor(text.length * 16 / 4294967296);
			words[15] = (text.length * 16) | 0;
		}
		var state = h.slice();
		for (var i = 0; i < 64; i++) {
			var x = words[i - 15], y = words[i - 2], a = state[0], e = state[4];
			if (i >= 16) words[i] = (words[i - 16] + (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) + words[i - 7] + (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10))) | 0;
			var t1 = (state[7] + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & state[5]) ^ (~e & state[6])) + k[i] + words[i]) | 0;
			var t2 = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & state[1]) ^ (a & state[2]) ^ (state[1] & state[2]))) | 0;
			state.pop(); state.unshift((t1 + t2) | 0); state[4] = (state[4] + t1) | 0;
		}
		for (var n = 0; n < 8; n++) h[n] = (h[n] + state[n]) | 0;
	}
	return h.map(function (word) { return ('00000000' + (word >>> 0).toString(16)).slice(-8); }).join('');
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

function wcposRetainDigest(index, digests, byteKey, id, digest) {
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
	var bytes = index[byteKey] || 0;
	var previous = digests.get(id);
	if (previous !== undefined) bytes -= wcposByteLength(previous);
	var size = wcposByteLength(digest);
	// Surrogates are small; escaping a literal descriptor can still push an exact value
	// past the ceiling. Forget only this id, preserving the other retained values.
	if (size > 2097152) {
		digests.delete(id);
		index[byteKey] = bytes;
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
	index[byteKey] = bytes + size;
}

export function indexSearchText(index, id, searchable) {
	var digests = index.__wcposSearchDigests || (index.__wcposSearchDigests = new Map());
	var digest = wcposSearchDigest(searchable);
	if (digests.get(id) === digest) return;
	if (digests.has(id) && typeof index.update === 'function') {
		index.update(id, searchable);
	} else {
		if (digests.has(id) && typeof index.remove === 'function') {
			index.remove(id);
			index.__wcposDigestBytes -= wcposByteLength(digests.get(id));
			digests.delete(id);
		}
		index.add(id, searchable);
	}
	wcposRetainDigest(index, digests, '__wcposDigestBytes', id, digest);
}

export function wcposChangedSearchEntries(index, entries) {
	// Persisted/emitted text and asynchronously indexed text answer different questions.
	// Replay starts empty here: its first unchanged write may append once redundantly.
	// Within a batch only the last entry for an id can describe its current text.
	var digests = index.__wcposPersistedDigests || (index.__wcposPersistedDigests = new Map());
	var last = new Map();
	entries.forEach(function (entry, position) {
		last.set(entry.id, position);
	});
	return entries.filter(function (entry, position) {
		if (last.get(entry.id) !== position) return false;
		var digest = wcposSearchDigest(entry.searchable);
		if (digests.get(entry.id) === digest) return false;
		wcposRetainDigest(index, digests, '__wcposPersistedDigestBytes', entry.id, digest);
		return true;
	});
}
/* eslint-enable no-var */

export const PRELUDE = `globalThis.WCPOS_FLEXSEARCH_CHURN_PATCH=1;\n${wcposSearchDigest.toString()}\n${wcposSha256.toString()}\n${wcposByteLength.toString()}\n${wcposRetainDigest.toString()}\n${wcposChangedSearchEntries.toString().replace(/^export /, '')}\n${indexSearchText
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
		'this.subs.forEach((e=>e.unsubscribe())),await this.queue,this.index.__wcposSearchDigests&&this.index.__wcposSearchDigests.clear(),this.index.__wcposDigestBytes=0,this.index.__wcposPersistedDigests&&this.index.__wcposPersistedDigests.clear(),this.index.__wcposPersistedDigestBytes=0}',
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
