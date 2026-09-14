import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

import FlexSearch from 'flexsearch';
import { addRxPlugin, createRxDatabase, randomToken } from 'rxdb';
import { getCheckpointDoc, RxDBPipelinePlugin } from 'rxdb/plugins/pipeline';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

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

// Recover only the vendor body for test fixtures, including when the local install has an
// older prelude. Production preparePatch still rejects outdated/partial installed patches.
function pristineSource(dist) {
	const anchors = DISTS.find((item) => item.dist === dist);
	let source = readFileSync(installedPath(dist), 'utf8');
	if (source.includes(MARKER)) {
		const start = dist === 'esm' ? 'import{ensureNotFalsy' : 'var e=require(';
		assert.ok(source.includes(start));
		source = source.slice(source.indexOf(start));
		// Accept only the exact prior cleanup or this revision's cleanup, not arbitrary
		// vendor close changes. Unknown anchors must still fail fixture patching.
		const previousClose =
			'this.subs.forEach((e=>e.unsubscribe())),await this.queue,this.index.__wcposSearchDigests&&this.index.__wcposSearchDigests.clear(),this.index.__wcposDigestBytes=0}';
		source = source
			.replace(anchors.closeAfter, anchors.closeBefore)
			.replace(previousClose, anchors.closeBefore);
		for (const key of ['live', 'replay', 'pipeline', 'append']) {
			assert.ok(source.includes(anchors[`${key}After`]), `missing installed ${key} rewrite`);
			source = source.replace(anchors[`${key}After`], anchors[`${key}Before`]);
		}
	}
	return source;
}

function patchedSource(dist) {
	return withFixture(
		pristineSource(dist),
		(path) =>
			preparePatch(
				path,
				DISTS.find((item) => item.dist === dist)
			).next
	);
}

// The offline copy lacks RxJS/Babel. Execute the installed plugin body, not a
// reimplementation, with only module bindings and database/event I/O stubbed.
// Indexing, replay, subscriber, pipeline handler and close remain premium code.
function loadPlugin(dist, source = patchedSource(dist), strict = false) {
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

async function openPlugin(plugin, persisted = [], deferred = false) {
	const pending = [];
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
			const bulk = { collectionName: collection.name, events: [{ documentData }] };
			if (deferred) pending.push(bulk);
			else await emit(bulk);
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
		flush: async () => {
			while (pending.length) await emit(pending.shift());
		},
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

function loadAppTeardown(create = async () => ({})) {
	const source = stripTypeScriptTypes(
		readFileSync(new URL('../packages/database/src/plugins/search.ts', import.meta.url), 'utf8')
	)
		.replace(/^import[\s\S]*?;\n/gm, '')
		.replaceAll('export ', '');
	const context = {
		create,
		ERROR_CODES: { UNEXPECTED_ERROR: 1 },
		getLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }),
	};
	runInNewContext(source + ';globalThis.app = { evictLRUIfNeeded, searchPlugin };', context);
	// Teardown is real app code; creation after teardown is unrelated database I/O.
	runInNewContext('createSearchInstance = create;', context);
	return context.app;
}

function appCollection(app) {
	const proto = {};
	app.searchPlugin.prototypes.RxCollection(proto);
	return Object.assign(Object.create(proto), {
		name: 'products',
		options: { searchFields: ['name'] },
		onClose: [],
		database: { collections: {} },
		_searchInstances: new Map(),
		_localeLRU: [],
	});
}

// Flush the promise-only lifecycle work; deferred database I/O remains held.
const lifecycleTurn = () => new Promise((resolve) => setImmediate(resolve));

for (const path of ['eviction', 'recreation']) {
	for (const failure of ['none', 'pipeline', 'index']) {
		test(`app ${path} waits for teardown, including rejecting shutdown (${failure})`, async () => {
			const releaseClose = Promise.withResolvers();
			const releaseCreate = Promise.withResolvers();
			let creates = 0;
			let closing = false;
			let stopped = false;
			const destination = { __wcposAppendIndex: {}, async remove() {} };
			const old = {
				collection: destination,
				pipeline: {
					async close() {
						closing = true;
						await releaseClose.promise;
						if (failure === 'pipeline') throw new Error('pipeline failed');
					},
				},
				async close() {
					stopped = true;
					if (failure === 'index') throw new Error('index failed');
				},
			};
			const replacement = { collection: {}, pipeline: { async close() {} }, async close() {} };
			const app = loadAppTeardown(async (_collection, locale) => {
				if (locale !== 'en') return replacement;
				creates++;
				await releaseCreate.promise;
				return replacement;
			});
			const collection = appCollection(app);
			collection._searchInstances.set('en', old);
			collection._localeLRU.push('en');
			if (path === 'eviction') {
				for (const locale of ['de', 'fr']) {
					collection._searchInstances.set(locale, replacement);
					collection._localeLRU.push(locale);
				}
			}
			const teardown =
				path === 'eviction' ? collection.initSearch('es') : collection.recreateSearch('en');
			await lifecycleTurn();
			assert.equal(closing, true, 'must close the pipeline, not only the destination');
			const init = collection.initSearch('EN-us');
			await lifecycleTurn();
			assert.equal(creates, 0, 'initialization must wait for shutdown');
			releaseClose.resolve();
			await lifecycleTurn();
			assert.equal(stopped, true, 'index shutdown must run after a rejecting pipeline close');
			assert.equal(Object.hasOwn(destination, '__wcposAppendIndex'), false);
			assert.equal(creates, 1);
			const second = collection.initSearch('en');
			await lifecycleTurn();
			assert.equal(creates, 1, 'replacement initialization must be deduplicated');
			releaseCreate.resolve();
			const [, initialized, secondInitialized] = await Promise.all([teardown, init, second]);
			assert.equal(initialized, secondInitialized);
			assert.equal(collection._searchInstances.get('en'), initialized);
			assert.ok(collection._searchInstances.size <= 3);
		});
	}
}

for (const first of ['initSearch', 'recreateSearch']) {
	test(`recreation waits for an already-running ${first} before replacing it`, async () => {
		const releaseCreate = Promise.withResolvers();
		let creates = 0;
		let closes = 0;
		const old = {
			collection: {},
			pipeline: { async close() {} },
			async close() {
				closes++;
			},
		};
		const replacement = { collection: {} };
		const app = loadAppTeardown(async () => {
			creates++;
			if (creates > 1) return replacement;
			await releaseCreate.promise;
			return old;
		});
		const collection = appCollection(app);
		const initial = collection[first]('en');
		await lifecycleTurn();
		assert.equal(creates, 1);
		const recreated = collection.recreateSearch('EN-us');
		const joined = collection.initSearch('en');
		await lifecycleTurn();
		assert.equal(creates, 1, 'must not create a replacement before previous init publishes');
		releaseCreate.resolve();
		const [original, final, initialized] = await Promise.all([initial, recreated, joined]);
		assert.equal(original, old);
		assert.equal(final, replacement);
		assert.equal(initialized, replacement);
		assert.equal(collection._searchInstances.get('en'), replacement);
		assert.equal(closes, 1);
	});
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

	for (const path of ['eviction', 'recreation']) {
		test(`[${dist}] app ${path} closes the pipeline and clears both retained maps`, async (t) => {
			const { instance, collection: destination, write } = await openPlugin(loadPlugin(dist));
			t.after(() => instance.close());
			await write('quartz');
			let pipelineClosed = false;
			instance.pipeline.close = async () => {
				pipelineClosed = true;
			};
			const indexed = instance.index.__wcposSearchDigests;
			const persisted = instance.index.__wcposPersistedDigests;
			assert.equal(indexed.size, 1);
			assert.equal(persisted.size, 1);
			const app = loadAppTeardown();
			const collection = {
				name: 'products',
				options: { searchFields: ['name'] },
				database: { collections: {} },
				_searchInstances: new Map([
					['en', instance],
					['de', {}],
					['fr', {}],
					['es', {}],
				]),
				_localeLRU: ['en', 'de', 'fr', 'es'],
			};
			if (path === 'eviction') await app.evictLRUIfNeeded(collection);
			else {
				const proto = {};
				app.searchPlugin.prototypes.RxCollection(proto);
				await proto.recreateSearch.call(collection, 'en');
			}
			assert.equal(
				Object.hasOwn(destination, '__wcposAppendIndex'),
				false,
				'destination must not retain the evicted index'
			);
			assert.equal(pipelineClosed, true, 'source pipeline must be stopped');
			assert.equal(instance.stopped, true);
			assert.equal(indexed.size, 0);
			assert.equal(persisted.size, 0);
			assert.equal(instance.index.__wcposDigestBytes, 0);
			assert.equal(instance.index.__wcposPersistedDigestBytes, 0);
		});
	}

	test(`[${dist}] deferred indexing preserves the final A in A → B → A`, async (t) => {
		const { instance, write, flush } = await openPlugin(loadPlugin(dist), [], true);
		t.after(() => instance.close());
		await write('quartz');
		await flush();
		await write('sapphire'); // Persist B, but its subscriber has not indexed it yet.
		await write('quartz'); // Must compare with persisted B, not indexed A.
		await flush();
		assert.deepEqual(instance.index.search('quartz'), ['product']);
		assert.deepEqual(instance.index.search('sapphire'), []);
	});

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
		await products.write('quartz', 'shared');
		await customers.write('sapphire', 'shared');
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
		await writeBatch(entries); // First write after replay populates persisted state.
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
		await writeBatch(entries);
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
	const keys = ['live', 'replay', 'pipeline', 'append', 'close'];
	const pristine = pristineSource(dist);
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
	'running the patch twice leaves isolated installed-dist fixtures byte-identical',
	{ skip: !DISTS.every(({ dist }) => installedDistPresent(dist)) },
	() => {
		const directory = mkdtempSync(join(tmpdir(), 'wcpos-flexsearch-cli-'));
		try {
			const script = join(directory, 'patch.mjs');
			writeFileSync(
				script,
				readFileSync(new URL('./patch-rxdb-premium-flexsearch-churn.mjs', import.meta.url))
			);
			const root = join(directory, 'node_modules/rxdb-premium');
			mkdirSync(root, { recursive: true });
			writeFileSync(join(root, 'package.json'), '{}');
			const paths = DISTS.map(({ dist }) => {
				const path = join(root, `dist/${dist}/plugins/flexsearch/rx-fulltext-search.js`);
				mkdirSync(dirname(path), { recursive: true });
				writeFileSync(path, pristineSource(dist));
				return path;
			});
			let previous;
			for (let i = 0; i < 2; i++) {
				const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
				assert.equal(result.status, 0, result.stderr);
				const current = paths.map((path) => readFileSync(path, 'utf8'));
				if (previous) assert.deepEqual(current, previous);
				previous = current;
			}
		} finally {
			rmSync(directory, { recursive: true, force: true });
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
	changedSearchEntries(index, [{ id: 'product', searchable: 'quartz' }]);
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

for (const [label, line, count] of [
	['entry', 'log', 40005],
	['byte', 'request failed '.repeat(100), 5000],
]) {
	test(`retention churn stays under both ceilings across ${label} clears`, () => {
		const index = new FlexSearch.Index(indexOptions);
		const rows = new Map();
		let clears = 0;
		for (let i = 0; i < count; i++) {
			const id = `log-${i}`;
			rows.set(id, line);
			const before = index.__wcposPersistedDigests?.size ?? 0;
			for (const entry of changedSearchEntries(index, [{ id, searchable: line }])) {
				indexSearchText(index, entry.id, entry.searchable);
			}
			// Model source retention: the plugin receives no delete event or index.remove.
			rows.delete(id);
			if (index.__wcposPersistedDigests.size < before) clears++;
			for (const [map, bytes] of [
				[index.__wcposSearchDigests, index.__wcposDigestBytes],
				[index.__wcposPersistedDigests, index.__wcposPersistedDigestBytes],
			]) {
				assert.ok(map.size <= 20000);
				assert.ok(bytes <= 2097152);
			}
		}
		assert.equal(rows.size, 0);
		assert.ok(clears >= 2, `expected repeated ${label} clears, saw ${clears}`);
		for (const map of [index.__wcposSearchDigests, index.__wcposPersistedDigests]) {
			assert.ok([...map.values()].reduce((n, text) => n + Buffer.byteLength(text), 0) <= 2097152);
		}
		// An id forgotten during churn must still be searchable on its next write.
		for (const entry of changedSearchEntries(index, [
			{ id: 'log-0', searchable: 'unmistakable' },
		])) {
			indexSearchText(index, entry.id, entry.searchable);
		}
		assert.deepEqual(index.search('unmistakable'), ['log-0']);
	});
}

test('replacing an id at the entry ceiling keeps the rest of the catalogue', () => {
	// A replace does not add an entry, so it must not trip the ceiling. Clearing here would
	// forget 19,999 products because one title changed, and every one of them would then be
	// re-appended and re-indexed on its next stock write — the exact churn this prevents.
	const index = new FlexSearch.Index({ preset: 'performance', tokenize: 'full', minlength: 3 });
	for (let i = 0; i < 20000; i += 1) {
		indexSearchText(index, `product-${i}`, `title ${i}`);
	}
	const digests = index.__wcposSearchDigests;
	assert.equal(digests.size, 20000, 'precondition: the map is exactly at the ceiling');
	indexSearchText(index, 'product-0', 'a different title');
	assert.equal(digests.size, 20000, 'a replace must not clear the map');
	assert.equal(digests.get('product-1'), 'title 1', 'the other entries must survive');
});

// These two are about the digest bookkeeping, not about FlexSearch. They use a counting stub
// because `tokenize: 'full'` expands every substring, so feeding it a megabyte of text is
// quadratic and aborts the process rather than failing an assertion.
const countingIndex = () => {
	const added = [];
	return { added, add: (id) => added.push(id), remove: () => {} };
};

test('oversized repeated text uses a bounded strong surrogate in both maps', () => {
	const index = countingIndex();
	const text = 'x'.repeat(2097153);
	for (let i = 0; i < 3; i++) {
		const kept = changedSearchEntries(index, [{ id: 'log-huge', searchable: text }]);
		assert.equal(kept.length, i === 0 ? 1 : 0);
		indexSearchText(index, 'log-huge', text);
	}
	assert.deepEqual(index.added, ['log-huge']);
	const encoded = Buffer.from(text, 'utf16le').swap16();
	const expected = `\0sha256:${Buffer.byteLength(text)}:${createHash('sha256').update(encoded).digest('hex')}`;
	for (const [map, tally] of [
		[index.__wcposSearchDigests, index.__wcposDigestBytes],
		[index.__wcposPersistedDigests, index.__wcposPersistedDigestBytes],
	]) {
		assert.equal(map.get('log-huge'), expected);
		assert.equal(tally, Buffer.byteLength(expected));
		assert.ok(tally < 100);
	}
	const changed = text.slice(0, -1) + 'y';
	assert.equal(changedSearchEntries(index, [{ id: 'log-huge', searchable: changed }]).length, 1);
	indexSearchText(index, 'log-huge', changed);
	assert.equal(index.added.length, 2);
	// A literal descriptor must not compare equal to an oversized value.
	indexSearchText(index, 'log-huge', index.__wcposSearchDigests.get('log-huge'));
	assert.equal(index.added.length, 3);
});

// Exercise padding boundaries, Unicode and lone surrogates in the emitted, self-contained
// helper. Node's crypto implementation is an independent oracle, not the production helper.
test('the emitted SHA-256 surrogate matches node crypto over exact UTF-16BE code units', () => {
	const context = {};
	runInNewContext(PRELUDE, context);
	for (const text of [
		'',
		'abc',
		'日😀',
		'\ud800',
		'\udc01',
		'x\ud800z',
		...Array.from({ length: 65 }, (_, n) => 'x'.repeat(n)),
	]) {
		const expected = createHash('sha256')
			.update(Buffer.from(text, 'utf16le').swap16())
			.digest('hex');
		assert.equal(context.wcposSha256(text), expected);
	}
});

test('the byte ceiling counts UTF-8 bytes, not UTF-16 code units', () => {
	// Each of these is 3 UTF-8 bytes but 1 UTF-16 code unit, so counting `.length` would let
	// the map hold three times the advertised ceiling before it cleared.
	const index = countingIndex();
	const wide = '日'.repeat(40000); // 120,000 bytes, 40,000 code units
	for (let i = 0; i < 30; i += 1) {
		indexSearchText(index, `log-${i}`, `${wide}${i}`);
	}
	// Measured independently, NOT read back from __wcposDigestBytes: the tally is the thing
	// a UTF-16 count corrupts, so asserting on it would pass either way.
	const retained = [...index.__wcposSearchDigests.values()].reduce(
		(total, value) => total + Buffer.byteLength(value, 'utf8'),
		0
	);
	assert.ok(retained <= 2097152, `retained UTF-8 bytes must stay capped, saw ${retained}`);
});

test('a forgotten document is simply re-indexed, never skipped wrongly', () => {
	const index = new FlexSearch.Index({ preset: 'performance', tokenize: 'full', minlength: 3 });
	indexSearchText(index, 'product', 'quartz');
	index.__wcposSearchDigests.clear();
	index.__wcposDigestBytes = 0;
	indexSearchText(index, 'product', 'sapphire');
	assert.deepEqual(index.search('sapphire'), ['product']);
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

test('an oversized replacement preserves unrelated indexed and persisted digests', () => {
	const index = countingIndex();
	const write = (id, searchable) => {
		const kept = changedSearchEntries(index, [{ id, searchable }]);
		indexSearchText(index, id, searchable);
		return kept;
	};
	write('product', 'quartz');
	write('log', 'old error');
	write('log', 'x'.repeat(2097153));
	assert.deepEqual(write('product', 'quartz'), []);
	assert.equal(index.added.filter((id) => id === 'product').length, 1);
	for (const [map, tally] of [
		[index.__wcposSearchDigests, index.__wcposDigestBytes],
		[index.__wcposPersistedDigests, index.__wcposPersistedDigestBytes],
	]) {
		assert.equal(map.get('product'), 'quartz');
		assert.equal(
			tally,
			[...map.values()].reduce((n, text) => n + Buffer.byteLength(text), 0)
		);
	}
});

test('a failed fallback add cannot strand the removed document behind its old digest', () => {
	const index = new FlexSearch.Index(indexOptions);
	index.update = undefined;
	indexSearchText(index, 'product', 'quartz');
	indexSearchText(index, 'other', 'topaz');
	const add = index.add;
	index.add = () => {
		throw new Error('add failed');
	};
	assert.throws(() => indexSearchText(index, 'product', 'sapphire'), /add failed/);
	assert.deepEqual(index.search('quartz'), []);
	const bytesAfterFailure = index.__wcposDigestBytes;
	index.add = add;
	indexSearchText(index, 'product', 'quartz');
	assert.deepEqual(index.search('quartz'), ['product']);
	assert.equal(bytesAfterFailure, Buffer.byteLength('topaz'));
});

test('an over-budget escaped literal removes only its own digest and bytes', () => {
	const index = countingIndex();
	for (const searchable of ['old error', '\0' + 'x'.repeat(2097151)]) {
		changedSearchEntries(index, [{ id: 'product', searchable: 'quartz' }]);
		indexSearchText(index, 'product', 'quartz');
		changedSearchEntries(index, [{ id: 'log', searchable }]);
		indexSearchText(index, 'log', searchable);
	}
	for (const [map, bytes] of [
		[index.__wcposSearchDigests, index.__wcposDigestBytes],
		[index.__wcposPersistedDigests, index.__wcposPersistedDigestBytes],
	]) {
		assert.deepEqual([...map], [['product', 'quartz']]);
		assert.equal(bytes, 6);
	}
});

// `wcposChangedSearchEntries` marks an id as persisted BEFORE the handler's upsert resolves. That
// is only safe because the vendor pipeline never runs a throwing handler again in the same
// process; a fresh process re-reads the batch with empty maps. This pins that vendor behaviour on
// a real RxPipeline over memory storage rather than trusting a comment. Mutation-checked: a
// pipeline that retries the handler once goes red on the call count (it reaches 2).
test('RxPipeline never re-invokes a throwing handler in-process', async (t) => {
	addRxPlugin(RxDBPipelinePlugin);
	const schema = {
		version: 0,
		primaryKey: 'id',
		type: 'object',
		properties: { id: { type: 'string', maxLength: 100 }, text: { type: 'string' } },
		required: ['id'],
	};
	const database = await createRxDatabase({
		name: `pipeline-pin-${randomToken(10)}`,
		storage: getRxStorageMemory(),
	});
	t.after(() => database.close());
	const { source, destination } = await database.addCollections({
		source: { schema },
		destination: { schema },
	});
	let calls = 0;
	// Throw only on the FIRST call: a pipeline that retried would then succeed, advance the
	// checkpoint and clear its error — visibly wrong on every assertion below.
	const pipeline = await source.addPipeline({
		identifier: 'pin',
		destination,
		waitForLeadership: false,
		handler: async () => {
			calls += 1;
			if (calls === 1) throw new Error('handler failed once');
		},
	});
	await pipeline.awaitIdle();
	const before = await getCheckpointDoc(pipeline);
	await source.insert({ id: 'product', text: 'quartz' });
	// Capture rather than assert.rejects so the call-count and checkpoint assertions below run
	// even when a retrying pipeline swallows the error.
	const surfaced = await pipeline.awaitIdle().then(
		() => null,
		(error) => error
	);
	// A further source write re-triggers the loop; the errored pipeline must still not run it.
	await source.insert({ id: 'other', text: 'topaz' });
	await new Promise((resolve) => setTimeout(resolve, 50));
	assert.equal(calls, 1, 'the throwing handler must run exactly once in this process');
	assert.deepEqual(
		(await getCheckpointDoc(pipeline))?.data,
		before?.data,
		'a throw must leave the checkpoint where it was'
	);
	assert.match(
		String(surfaced?.message),
		/handler failed once/,
		'the error must surface through awaitIdle, not be swallowed'
	);
	// The "next process": a fresh pipeline with the same identifier re-reads the unacknowledged
	// batch, which is what makes the pre-write marking self-healing across restarts.
	await pipeline.close();
	const replayed = [];
	const restarted = await source.addPipeline({
		identifier: 'pin',
		destination,
		waitForLeadership: false,
		handler: async (documents) => {
			replayed.push(...documents.map((document) => document.primary));
		},
	});
	await restarted.awaitIdle();
	assert.deepEqual(replayed.sort(), ['other', 'product']);
});
