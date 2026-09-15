import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';

import get from 'lodash/get.js';
import * as rxdb from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
// Dependabot installs omit the licence-gated dist; only that declared absence skips.
const premiumRoot = dirname(createRequire(import.meta.url).resolve('rxdb-premium/package.json'));
const premium = existsSync(join(premiumRoot, 'dist/esm/plugins/flexsearch/index.js'))
	? await import('rxdb-premium/plugins/flexsearch')
	: null;
const { addFulltextSearch, getFlexsearchIndexSchema } = premium ?? {};
if (premium) rxdb.addRxPlugin(premium.RxDBFlexSearchPlugin);
const loadSource = (path) =>
	stripTypeScriptTypes(readFileSync(new URL(path, import.meta.url), 'utf8'))
		.replace(/^import[\s\S]*?;\n/gm, '')
		.replaceAll('export ', '');
const context = {
	...rxdb,
	addFulltextSearch,
	get,
	getLogger: () => ({ debug() {}, info() {}, warn() {} }),
};
runInNewContext(
	loadSource('../packages/sync-core/src/searchIndexConfig.ts') +
		'\n' +
		loadSource('../packages/database/src/plugins/search.ts') +
		';globalThis.create = createSearchInstance; globalThis.identifier = getSearchIdentifier;',
	context
);

for (const rebuild of [false, true]) {
	test(
		`export history stays bounded (${rebuild ? 'oversized rebuild' : 'fresh destination'})`,
		{ skip: !premium && 'licence-gated premium dist absent' },
		async () => {
			const db = await rxdb.createRxDatabase({
				name: rxdb.randomToken(10),
				storage: getRxStorageMemory(),
				multiInstance: false,
				eventReduce: true,
			});
			try {
				const { products } = await db.addCollections({
					products: {
						schema: {
							version: 0,
							primaryKey: 'id',
							type: 'object',
							properties: {
								id: { type: 'string', maxLength: 100 },
								name: { type: 'string' },
							},
							required: ['id', 'name'],
						},
						options: { searchFields: ['name'] },
					},
				});
				const name = `${context.identifier('products', 'en')}_flexsearch`;
				if (rebuild) {
					const seed = (
						await db.addCollections({
							[name]: {
								schema: getFlexsearchIndexSchema(products.schema.jsonSchema),
							},
						})
					)[name];
					await seed.upsert({
						type: 'append',
						name: 'stale',
						token: db.token,
						dataAr: [{ id: 'gone', searchable: 'obsolete' }],
					});
					await seed.close();
				}
				const instance = await context.create(products, 'en');
				const destination = instance.collection;
				const appendQuery = destination.find({ selector: { type: 'append' } });
				assert.equal((await appendQuery.exec()).length, 0, 'oversized history was rebuilt');
				await products.upsert({ id: 'soap', name: 'Kuorintasaippua' });
				assert.deepEqual(
					(await instance.find('aipp')).map((doc) => doc.primary),
					['soap']
				);
				await instance.cleanup();
				assert.equal((await appendQuery.exec()).length, 0, 'cleanup removes append docs');
				let peakPayloads = 0;
				for (let n = 0; n < 20; n++) {
					await destination.upsert({
						type: 'index',
						name: 'map',
						token: db.token,
						dataStr: `${n}:${'x'.repeat(32_768)}`,
					});
					const payloads = destination._changeEventBuffer
						.getBuffer()
						.flatMap((event) => [event.documentData, event.previousDocumentData])
						.filter((doc) => doc?.type === 'index' && doc.dataStr);
					peakPayloads = Math.max(peakPayloads, payloads.length);
				}
				assert.ok(
					peakPayloads <= 2,
					`retained ${peakPayloads} export payloads across 20 upserts (maximum 2)`
				);
				await destination.upsert({ type: 'append', name: 'probe', token: db.token, dataAr: [] });
				await destination.upsert({ type: 'append', name: 'probe2', token: db.token, dataAr: [] });
				assert.equal(
					(await appendQuery.exec()).length,
					2,
					'old query re-reads storage after history expires'
				);
				await destination.bulkRemove(['append|probe', 'append|probe2']);
				assert.equal(
					(await appendQuery.exec()).length,
					0,
					'bulk append removals remain observable'
				);
				for (let n = 0; n < 5; n++) await products.upsert({ id: 'soap', name: `soap ${n}` });
				assert.ok(
					products._changeEventBuffer.getBuffer().length >= 6,
					'ordinary collection history is untouched'
				);
			} finally {
				await db.remove();
			}
		}
	);
}
