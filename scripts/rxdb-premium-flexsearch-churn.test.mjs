import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

import FlexSearch from 'flexsearch';

import {
	DISTS,
	indexSearchText,
	wcposChangedSearchEntries as changedSearchEntries,
	MARKER,
	PRELUDE,
	preparePatch,
} from './patch-rxdb-premium-flexsearch-churn.mjs';

const require = createRequire(import.meta.url);
// rxdb-premium is licence-gated: its dist is materialised by a postinstall step. CI installs
// Dependabot branches with --ignore-scripts, so the dist is legitimately absent there and a
// top-level read would throw ENOENT before a single test ran, blocking every dependency PR.
// Resolve lazily and skip only the cases that need the installed file.
let packageRoot = null;
try {
	packageRoot = dirname(require.resolve('rxdb-premium/package.json'));
} catch {
	packageRoot = null;
}
const indexOptions = { preset: 'performance', tokenize: 'full', minlength: 3 };
const installedPath = (dist) =>
	packageRoot ? join(packageRoot, `dist/${dist}/plugins/flexsearch/rx-fulltext-search.js`) : null;

/** Whether the licence-gated dist was materialised in this environment. */
function installedDistPresent(dist) {
	const path = installedPath(dist);
	return Boolean(path) && existsSync(path);
}

// The offline copy lacks RxJS/Babel. Execute the installed plugin body, not a
// reimplementation, with only module bindings and database/event I/O stubbed.
// Indexing, replay, subscriber, pipeline handler and close remain premium code.
function loadPlugin(dist, source = readFileSync(installedPath(dist), 'utf8'), strict = false) {
	const core = { ensureNotFalsy: (value) => assert.ok(value) || value };
	const schema = { getFlexsearchIndexSchema: (value) => value };
	const rxjs = { filter: (fn) => fn, mergeMap: (fn) => fn };
	const exports = {};
	const modules = {
		'rxdb/plugins/core': core,
		'./schema.js': schema,
		rxjs,
		flexsearch: FlexSearch,
		'@babel/runtime/helpers/interopRequireDefault': (value) => ({ default: value }),
	};
	if (dist === 'esm') {
		source = source
			.replace('import{ensureNotFalsy as e}from"rxdb/plugins/core";', 'var e=core.ensureNotFalsy;')
			.replace(
				'import{getFlexsearchIndexSchema as t}from"./schema.js";',
				'var t=schema.getFlexsearchIndexSchema;'
			)
			.replace('import{filter as a,mergeMap as i}from"rxjs";', 'var a=rxjs.filter,i=rxjs.mergeMap;')
			.replace('import n from"flexsearch";', 'var n=FlexSearch;')
			.replaceAll('export ', '');
		source += ';Object.assign(exports,{RxFulltextSearch,addFulltextSearch});';
	}
	runInNewContext((strict ? "'use strict';\n" : '') + source, {
		core,
		schema,
		rxjs,
		FlexSearch,
		exports,
		Map,
		require: (name) => {
			assert.ok(name in modules, `unexpected dependency: ${name}`);
			return modules[name];
		},
	});
	return exports;
}

async function openPlugin(plugin, persisted = []) {
	const listeners = new Set();
	const emit = async (bulk) => {
		for (const listener of listeners) await listener(bulk);
	};
	const database = {
		token: 'test',
		hashFunction: async (value) => value,
		eventBulks$: {
			pipe: (filter, map) => ({
				subscribe: (callback) => {
					const listener = async (bulk) => {
						if (filter(bulk)) callback(await map(bulk));
					};
					listeners.add(listener);
					return { unsubscribe: () => listeners.delete(listener) };
				},
			}),
		},
	};
	const collection = {
		name: 'test_flexsearch',
		database,
		onClose: [],
		schema: { jsonSchema: { properties: { id: { maxLength: 100 } } } },
		find: () => ({ exec: async () => persisted }),
		upsert: async (documentData) => {
			await emit({ collectionName: collection.name, events: [{ documentData }] });
		},
	};
	database.addCollections = async () => ({ test_flexsearch: collection });
	let handler;
	const sourceCollection = {
		database,
		schema: collection.schema,
		addPipeline: async (options) => {
			handler = options.handler;
			return { awaitIdle: async () => {} };
		},
	};
	const instance = await plugin.addFulltextSearch({
		collection: sourceCollection,
		identifier: 'test',
		indexOptions,
		docToString: (doc) => doc.text,
	});
	await instance.queue;
	return {
		instance,
		collection,
		writeBatch: (entries) =>
			handler(
				entries.map(({ id, searchable }) => ({
					primary: id,
					text: searchable,
					_data: { _meta: { lwt: 1 } },
				}))
			),
		write: (text, id = 'product') =>
			handler([
				{
					primary: id,
					text,
					_data: { _meta: { lwt: 1 } },
				},
			]),
	};
}

async function exportedSize(index) {
	let bytes = 0;
	await index.export((_key, data) => {
		bytes += Buffer.byteLength(data);
	});
	return bytes;
}

for (const dist of ['esm', 'cjs']) {
	if (!installedDistPresent(dist)) {
		test(
			`[${dist}] installed dist absent — licence-gated postinstall did not run`,
			{ skip: true },
			() => {}
		);
		continue;
	}
	test(`[${dist}] emitted prelude and rewritten regions run in strict mode`, async (t) => {
		const plugin = loadPlugin(dist, undefined, true);
		const { instance, writeBatch } = await openPlugin(plugin, [
			{ type: 'append', dataAr: [{ id: 'product', searchable: 'quartz' }] },
		]);
		t.after(() => instance.close());
		assert.deepEqual(instance.index.search('quartz'), ['product']);
		await assert.doesNotReject(() =>
			writeBatch([
				{ id: 'product', searchable: 'quartz' },
				{ id: 'other', searchable: 'topaz' },
			])
		);
		assert.deepEqual(instance.index.search('topaz'), ['other']);
		await assert.doesNotReject(() => instance.close());
		assert.equal(instance.index.__wcposSearchDigests.size, 0);
	});

	test(`[${dist}] two plugin instances filter against their own indexes`, async (t) => {
		// Load once: separate VM contexts would hide a module-scoped capture bug.
		const plugin = loadPlugin(dist);
		const products = await openPlugin(plugin, [
			{ type: 'append', dataAr: [{ id: 'shared', searchable: 'quartz' }] },
		]);
		t.after(() => products.instance.close());
		const customers = await openPlugin(plugin, [
			{ type: 'append', dataAr: [{ id: 'shared', searchable: 'sapphire' }] },
		]);
		t.after(() => customers.instance.close());
		const productUpsert = t.mock.method(products.collection, 'upsert');
		const customerUpsert = t.mock.method(customers.collection, 'upsert');
		// Both pipelines exist before either handler runs. The changed product text
		// equals the customer's digest, so a shared capture wrongly drops it.
		await products.writeBatch([
			{ id: 'shared', searchable: 'quartz' },
			{ id: 'shared', searchable: 'sapphire' },
			{ id: 'product-only', searchable: 'emerald' },
		]);
		await customers.writeBatch([
			{ id: 'shared', searchable: 'sapphire' },
			{ id: 'customer-only', searchable: 'topaz' },
		]);
		assert.equal(productUpsert.mock.callCount(), 1);
		assert.equal(customerUpsert.mock.callCount(), 1);
		assert.deepEqual(JSON.parse(JSON.stringify(productUpsert.mock.calls[0].arguments[0].dataAr)), [
			{ id: 'shared', searchable: 'sapphire' },
			{ id: 'product-only', searchable: 'emerald' },
		]);
		assert.deepEqual(JSON.parse(JSON.stringify(customerUpsert.mock.calls[0].arguments[0].dataAr)), [
			{ id: 'customer-only', searchable: 'topaz' },
		]);
		assert.deepEqual(products.instance.index.search('sapphire'), ['shared']);
		assert.deepEqual(customers.instance.index.search('emerald'), []);
	});

	test(`[${dist}] all unchanged entries never upsert an append document`, async (t) => {
		const entries = [
			{ id: 'product', searchable: 'quartz' },
			{ id: 'other', searchable: 'topaz' },
		];
		const { instance, collection, writeBatch } = await openPlugin(loadPlugin(dist), [
			{ type: 'append', dataAr: entries },
		]);
		t.after(() => instance.close());
		const upsert = t.mock.method(collection, 'upsert');
		await writeBatch(entries);
		assert.equal(upsert.mock.callCount(), 0);
	});

	test(`[${dist}] mixed batch appends only changed text without advancing digests`, async (t) => {
		const entries = [
			{ id: 'product', searchable: 'quartz' },
			{ id: 'other', searchable: 'topaz' },
			{ id: 'third', searchable: 'emerald' },
		];
		const { instance, collection, writeBatch } = await openPlugin(loadPlugin(dist), [
			{ type: 'append', dataAr: entries },
		]);
		t.after(() => instance.close());
		const before = new Map(instance.index.__wcposSearchDigests);
		// Do not emit the append yet: only the index subscriber may advance digests.
		const upsert = t.mock.method(collection, 'upsert', async () => {});
		await writeBatch([entries[0], { id: 'other', searchable: 'sapphire' }, entries[2]]);
		assert.equal(upsert.mock.callCount(), 1);
		const document = upsert.mock.calls[0].arguments[0];
		assert.equal(document.type, 'append');
		assert.deepEqual(JSON.parse(JSON.stringify(document.dataAr)), [
			{ id: 'other', searchable: 'sapphire' },
		]);
		assert.deepEqual(instance.index.__wcposSearchDigests, before);
	});

	test(`[${dist}] snapshot-restored boot still appends the first unchanged entry`, async (t) => {
		const index = new FlexSearch.Index(indexOptions);
		index.add('product', 'quartz');
		const persisted = [];
		await index.export((name, dataStr) => persisted.push({ type: 'index', name, dataStr }));
		const { instance, collection, write } = await openPlugin(loadPlugin(dist), persisted);
		t.after(() => instance.close());
		assert.deepEqual(instance.index.search('quartz'), ['product']);
		assert.equal(instance.index.__wcposSearchDigests?.size ?? 0, 0);
		const upsert = t.mock.method(collection, 'upsert');
		await write('quartz');
		assert.equal(upsert.mock.callCount(), 1);
		const document = upsert.mock.calls[0].arguments[0];
		assert.equal(document.type, 'append');
		assert.deepEqual(JSON.parse(JSON.stringify(document.dataAr)), [
			{ id: 'product', searchable: 'quartz' },
		]);
	});

	test(`[${dist}] unchanged text skips indexing and keeps serialized size stable`, async (t) => {
		const { instance, write } = await openPlugin(loadPlugin(dist));
		t.after(() => instance.close());
		await write('quartz');
		const before = await exportedSize(instance.index);
		let calls = 0;
		const add = instance.index.add;
		instance.index.add = function (...args) {
			calls++;
			return add.apply(this, args);
		};
		for (let i = 0; i < 1000; i++) await write('quartz');
		assert.equal(await exportedSize(instance.index), before);
		assert.equal(calls, 0, 'stock-only changes must never call add');
	});

	test(`[${dist}] changed text releases postings and finds only current text`, async (t) => {
		const { instance, write } = await openPlugin(loadPlugin(dist));
		t.after(() => instance.close());
		await write('quartz');
		let updates = 0;
		const update = instance.index.update;
		instance.index.update = function (...args) {
			updates++;
			return update.apply(this, args);
		};
		for (let i = 0; i < 1000; i++) await write(i % 2 ? 'sapphire' : 'topaz');
		const before = await exportedSize(instance.index);
		for (let i = 0; i < 1000; i++) await write(i % 2 ? 'sapphire' : 'topaz');
		assert.equal(await exportedSize(instance.index), before);
		assert.deepEqual(instance.index.search('sapphire'), ['product']);
		assert.deepEqual(instance.index.search('quartz'), []);
		assert.deepEqual(instance.index.search('topaz'), []);
		assert.equal(updates, 2000);
	});

	test(`[${dist}] cycling a fixed vocabulary does not grow the index`, async (t) => {
		// The leak that matters is per-UPDATE, not per-word. An index asked to hold 1,000
		// distinct words legitimately grows to hold them; that is storage, not a leak. What
		// must never grow is re-indexing text the index has already seen, which is what a
		// shop floor generates all day.
		const { instance, write } = await openPlugin(loadPlugin(dist));
		t.after(() => instance.close());
		const vocabulary = Array.from({ length: 50 }, (_, i) => `token${String(i).padStart(3, '0')}`);
		for (const text of vocabulary) await write(text);
		const before = await exportedSize(instance.index);
		for (let round = 0; round < 20; round += 1) {
			for (const text of vocabulary) await write(text);
		}
		const after = await exportedSize(instance.index);
		t.diagnostic(`one pass: ${before} bytes; twenty further passes: ${after} bytes`);
		assert.equal(after, before, 'reindexing a vocabulary already held must not grow the index');
	});

	test(`[${dist}] boot replay shares digests with live writes and close clears them`, async (t) => {
		const persisted = [
			{
				type: 'append',
				dataAr: [
					{ id: 'product', searchable: 'quartz' },
					...Array.from({ length: 100 }, () => ({ id: 'product', searchable: 'sapphire' })),
				],
			},
		];
		const { instance, write } = await openPlugin(loadPlugin(dist), persisted);
		t.after(() => instance.close());
		assert.deepEqual(instance.index.search('sapphire'), ['product']);
		assert.deepEqual(instance.index.search('quartz'), []);
		const digests = instance.index.__wcposSearchDigests;
		assert.equal(digests?.size, 1);
		instance.index.add = () => assert.fail('boot digest was not reused');
		await write('sapphire');
		await instance.close();
		assert.equal(digests.size, 0);
	});
}

function withFixture(content, fn) {
	const directory = mkdtempSync(join(tmpdir(), 'wcpos-flexsearch-churn-'));
	const path = join(directory, 'rx-fulltext-search.js');
	writeFileSync(path, content);
	try {
		return fn(path);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

for (const anchors of DISTS) {
	const { dist } = anchors;
	if (!installedDistPresent(dist)) {
		test(`[${dist}] anchors unverifiable — installed dist absent`, { skip: true }, () => {});
		continue;
	}
	const installed = readFileSync(installedPath(dist), 'utf8');
	const keys = ['live', 'replay', 'pipeline', 'append', 'close'];
	const pristine = keys.reduce(
		(source, key) => source.replace(anchors[`${key}After`], anchors[`${key}Before`]),
		installed.replace(PRELUDE, '')
	);
	test(`[${dist}] exact anchors patch idempotently and reject changed preludes`, () => {
		withFixture(pristine, (path) => {
			const { next, status } = preparePatch(path, anchors);
			assert.equal(status, 'patched');
			writeFileSync(path, next);
			assert.deepEqual(preparePatch(path, anchors), { path, status: 'already patched' });
			assert.equal(readFileSync(path, 'utf8'), next);
			writeFileSync(path, next.replace('return searchable;', "return searchable + '';"));
			assert.throws(() => preparePatch(path, anchors), /outdated prelude/);
			writeFileSync(path, next.replace(PRELUDE, `function ${MARKER}(){}\n`));
			assert.throws(() => preparePatch(path, anchors), /outdated prelude/);
		});
	});
	for (const key of keys) {
		test(`[${dist}] rejects missing, duplicate or partial ${key} rewrites`, () => {
			for (const count of [0, 2]) {
				const unknown = pristine.replace(
					anchors[`${key}Before`],
					anchors[`${key}Before`].repeat(count)
				);
				withFixture(unknown, (path) => {
					assert.throws(() => preparePatch(path, anchors), new RegExp(`matched ${count} times`));
				});
			}
			withFixture(pristine, (path) => {
				const { next } = preparePatch(path, anchors);
				writeFileSync(path, next.replace(anchors[`${key}After`], anchors[`${key}Before`]));
				assert.throws(() => preparePatch(path, anchors), new RegExp(`rewrite ${key} is missing`));
			});
		});
	}
}

test(
	'running the installed patch twice leaves both dists byte-identical',
	{ skip: !DISTS.every(({ dist }) => installedDistPresent(dist)) },
	() => {
		let previous;
		for (let i = 0; i < 2; i++) {
			const result = spawnSync(
				process.execPath,
				['scripts/patch-rxdb-premium-flexsearch-churn.mjs'],
				{
					cwd: join(import.meta.dirname, '..'),
					encoding: 'utf8',
				}
			);
			assert.equal(result.status, 0, result.stderr);
			const current = DISTS.map(({ dist }) => readFileSync(installedPath(dist), 'utf8'));
			if (previous) assert.deepEqual(current, previous);
			previous = current;
		}
	}
);

for (const removeAvailable of [true, false]) {
	test(`missing update falls back with remove=${removeAvailable}`, async () => {
		const real = new FlexSearch.Index(indexOptions);
		const calls = [];
		const index = {
			add: (id, text) => {
				calls.push('add');
				real.add(id, text);
			},
		};
		if (removeAvailable)
			index.remove = (id) => {
				calls.push('remove');
				real.remove(id);
			};
		indexSearchText(index, 'product', 'quartz');
		indexSearchText(index, 'product', 'quartz');
		indexSearchText(index, 'product', 'sapphire');
		assert.deepEqual(calls, removeAvailable ? ['add', 'remove', 'add'] : ['add', 'add']);
		assert.deepEqual(real.search('sapphire'), ['product']);
		assert.deepEqual(real.search('quartz'), []);
		const before = await exportedSize(real);
		for (let i = 0; i < 1000; i++) indexSearchText(index, 'product', 'sapphire');
		assert.equal(await exportedSize(real), before);
	});
}

test('a batch carrying one document twice persists only its last text', () => {
	// Superseded entries must not reach the history: comparing each entry against the
	// PRE-batch value keeps 'sapphire' and drops the trailing 'quartz', leaving the history
	// claiming text the document no longer has.
	const index = new FlexSearch.Index({ preset: 'performance', tokenize: 'full', minlength: 3 });
	indexSearchText(index, 'product', 'quartz');
	const kept = changedSearchEntries(index, [
		{ id: 'product', searchable: 'sapphire' },
		{ id: 'product', searchable: 'quartz' },
	]);
	assert.deepEqual(kept, []);
	const changed = changedSearchEntries(index, [
		{ id: 'product', searchable: 'quartz' },
		{ id: 'product', searchable: 'sapphire' },
	]);
	assert.deepEqual(changed, [{ id: 'product', searchable: 'sapphire' }]);
});

test('text sharing a 32-bit hash with the previous value is still re-indexed', () => {
	// 'AaAa' and 'BBBB' both hash to 4:2031744. Under the old digest the update was skipped
	// and the document kept answering to its OLD text forever.
	const index = new FlexSearch.Index({ preset: 'performance', tokenize: 'full', minlength: 3 });
	indexSearchText(index, 'product', 'AaAa');
	indexSearchText(index, 'product', 'BBBB');
	assert.deepEqual(index.search('BBBB'), ['product']);
	assert.deepEqual(index.search('AaAa'), []);
});

test('indexed-text state is per-index, exact, and not committed on failed writes', () => {
	const first = new FlexSearch.Index(indexOptions);
	const second = new FlexSearch.Index(indexOptions);
	const text = 'searchable '.repeat(100);
	indexSearchText(first, 'product', text);
	indexSearchText(second, 'product', text);
	assert.deepEqual(second.search('searchable'), ['product']);
	assert.notEqual(first.__wcposSearchDigests, second.__wcposSearchDigests);
	assert.equal(first.__wcposSearchDigests.size, 1);
	// The EXACT text, not a digest: 'AaAa' and 'BBBB' share a 32-bit hash, and a collision
	// here silently freezes that document's search results.
	assert.equal(first.__wcposSearchDigests.get('product'), text);
	const update = first.update;
	first.update = () => {
		throw new Error('write failed');
	};
	assert.throws(() => indexSearchText(first, 'product', 'sapphire'), /write failed/);
	first.update = update;
	indexSearchText(first, 'product', 'sapphire');
	assert.deepEqual(first.search('sapphire'), ['product']);
});
