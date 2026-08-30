// node:test, not jest (jest-expo's preset would otherwise pick this file up; the
// `metro/` directory is in jest's testPathIgnorePatterns like `plugins/`). It is
// invoked directly from test.yml rather than via a package.json script because
// package.json SCRIPTS are part of the native fingerprint — adding one spends an
// EAS build. The jest block is not part of the fingerprint.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAX_CACHED_BUNDLES, withBundleSerializerCache } from './bundle-serializer-cache.js';

function makeGraph(paths) {
	return { dependencies: new Map(paths.map((p) => [p, { path: p }])), entryPoints: new Set() };
}

function harness() {
	let calls = 0;
	const logs = [];
	const config = {
		serializer: {
			customSerializer: async (entryPoint, preModules, graph) => {
				calls += 1;
				return `bundle#${calls}:${entryPoint}:${preModules.length}:${graph.dependencies.size}`;
			},
		},
	};
	withBundleSerializerCache(config, { log: (line) => logs.push(line) });
	const options = {
		dev: false,
		sourceUrl: 'http://x/entry.bundle?platform=ios',
		createModuleId: () => 1,
	};
	return {
		serialize: (graph, pre = [], entry = 'entry.js', opts = options) =>
			config.serializer.customSerializer(entry, pre, graph, opts),
		calls: () => calls,
		logs,
	};
}

test('an unchanged graph is served from cache', async () => {
	const h = harness();
	const graph = makeGraph(['a.js', 'b.js']);
	const pre = [{ path: 'polyfill.js' }];
	const first = await h.serialize(graph, pre);
	const second = await h.serialize(graph, pre);
	assert.equal(second, first);
	assert.equal(h.calls(), 1);
	assert.match(h.logs[0], /^\[bundle-cache\] miss: serialised \d+ bytes in \d+ms$/);
	assert.match(h.logs[1], /^\[bundle-cache\] hit \(\d+ bytes\)$/);
});

test('a re-transformed module (new object, same key) invalidates', async () => {
	const h = harness();
	const graph = makeGraph(['a.js', 'b.js']);
	await h.serialize(graph);
	graph.dependencies.set('b.js', { path: 'b.js' }); // what Graph._processModule does on change
	const after = await h.serialize(graph);
	assert.equal(h.calls(), 2);
	assert.match(after, /^bundle#2/);
	// and it is cached again from there
	await h.serialize(graph);
	assert.equal(h.calls(), 2);
});

test('an added or deleted module invalidates', async () => {
	const h = harness();
	const graph = makeGraph(['a.js']);
	await h.serialize(graph);
	graph.dependencies.set('c.js', { path: 'c.js' });
	await h.serialize(graph);
	assert.equal(h.calls(), 2);
	graph.dependencies.delete('a.js');
	await h.serialize(graph);
	assert.equal(h.calls(), 3);
});

test('prepend modules are compared by element, not array identity', async () => {
	const h = harness();
	const graph = makeGraph(['a.js']);
	const polyfill = { path: 'polyfill.js' };
	await h.serialize(graph, [polyfill]);
	await h.serialize(graph, [polyfill]); // fresh array, same module: hit
	assert.equal(h.calls(), 1);
	await h.serialize(graph, [{ path: 'polyfill.js' }]); // re-created module: miss
	assert.equal(h.calls(), 2);
});

test('different serializer options are different entries; functions are ignored in the key', async () => {
	const h = harness();
	const graph = makeGraph(['a.js']);
	const base = {
		dev: false,
		sourceUrl: 'http://x/entry.bundle?platform=ios',
		createModuleId: () => 1,
	};
	await h.serialize(graph, [], 'entry.js', base);
	await h.serialize(graph, [], 'entry.js', { ...base, createModuleId: () => 2 });
	assert.equal(h.calls(), 1, 'a different function value must not miss');
	await h.serialize(graph, [], 'entry.js', {
		...base,
		sourceUrl: 'http://x/entry.bundle?platform=android',
	});
	assert.equal(h.calls(), 2, 'a different sourceUrl must miss');
	await h.serialize(graph, [], 'other.js', base);
	assert.equal(h.calls(), 3, 'a different entry point must miss');
});

test('unrelated graphs do not share entries', async () => {
	const h = harness();
	await h.serialize(makeGraph(['a.js']));
	await h.serialize(makeGraph(['a.js']));
	assert.equal(h.calls(), 2);
});

test(`at most ${MAX_CACHED_BUNDLES} option variants are kept per graph, oldest evicted first`, async () => {
	const h = harness();
	const graph = makeGraph(['a.js']);
	const opts = (n) => ({ sourceUrl: `http://x/entry.bundle?v=${n}` });
	for (let n = 0; n < MAX_CACHED_BUNDLES + 1; n++) {
		await h.serialize(graph, [], 'entry.js', opts(n));
	}
	assert.equal(h.calls(), MAX_CACHED_BUNDLES + 1);
	await h.serialize(graph, [], 'entry.js', opts(MAX_CACHED_BUNDLES)); // newest: hit
	assert.equal(h.calls(), MAX_CACHED_BUNDLES + 1);
	await h.serialize(graph, [], 'entry.js', opts(0)); // oldest: evicted, miss
	assert.equal(h.calls(), MAX_CACHED_BUNDLES + 2);
});

test('object results ({ code, map }) are cached and sized by code', async () => {
	const config = {
		serializer: { customSerializer: async () => ({ code: 'abc', map: '{}' }) },
	};
	const logs = [];
	withBundleSerializerCache(config, { log: (line) => logs.push(line) });
	const graph = makeGraph(['a.js']);
	const first = await config.serializer.customSerializer('e', [], graph, {});
	const second = await config.serializer.customSerializer('e', [], graph, {});
	assert.equal(second, first);
	assert.match(logs[0], /serialised 3 bytes/);
});

test('refuses to wrap a config without a customSerializer', () => {
	assert.throws(
		() => withBundleSerializerCache({ serializer: {} }),
		/customSerializer must be set first/
	);
});
