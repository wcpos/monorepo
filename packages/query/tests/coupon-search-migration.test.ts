/** Upgrade the real index-owning collection, not just a stand-alone schema fixture. */
import { waitFor } from '@testing-library/react';
import { addRxPlugin, createRxDatabase, getAllCollectionDocuments } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { RxDBFlexSearchPlugin } from 'rxdb-premium/plugins/flexsearch';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';
import { firstValueFrom } from 'rxjs';

import { searchPlugin } from '@wcpos/database/plugins/search';
import { engineSyncCollectionCreators, memoryEngineStorage } from '@wcpos/sync-engine/testing';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { observeEngineQuery } from '../src/engine-query';

setPremiumFlag();
addRxPlugin(RxDBMigrationSchemaPlugin);
addRxPlugin(RxDBFlexSearchPlugin);
addRxPlugin(searchPlugin);

it('retires all coupon indexes across upgrade while preserving coupon data and other indexes', async () => {
	const storage = memoryEngineStorage();
	const creators = engineSyncCollectionCreators();
	const open = () =>
		createRxDatabase({
			name: 'coupon-index-upgrade',
			storage,
			multiInstance: false,
			allowSlowCount: true,
		});
	const old = await open();
	// Coupons v0 had the same storage shape as categories, differing only in title.
	await old.addCollections({
		coupons: {
			schema: { ...(creators.categories.schema as object), title: 'Woo coupon document schema' },
		},
	} as never);
	await old.collections.coupons.insert({
		uuid: 'saved-coupon',
		remoteId: '7',
		payload: { code: 'CAFÉ-123', description: 'Été offer' },
		sync: { revision: 'unchanged', partial: false, source: 'woo-rest' },
		local: { dirty: true, pendingMutationIds: ['pending-edit'] },
	});
	await old.collections.coupons.insert({
		uuid: 'long-coupon',
		remoteId: '8',
		payload: { code: 'PREFIX-abcdefghijklmnop-SUFFIX', description: '' },
		sync: { revision: 'unchanged', partial: false, source: 'woo-rest' },
		local: { dirty: false, pendingMutationIds: [] },
	});
	const options = { searchFields: ['payload.code', 'payload.description'] };
	const index = await old.collections.coupons.initSearch('en', options);
	await (index as unknown as { pipeline: { awaitIdle(): Promise<void> } }).pipeline.awaitIdle();
	expect((await index!.find('café')).map((doc) => doc.primary)).toEqual(['saved-coupon']);
	expect(await index!.find('fix-abc')).toEqual([]); // Source tokenizer split the long code.
	const queries = ['CAF', 'afé', '123', 'été', 'OFF', 'CAF été', 'unknown', 'ete zz', 'CAFE-123'];
	const previousAnswers = new Map<string, string[]>();
	for (const search of queries)
		previousAnswers.set(
			search,
			(await index!.find(search)).map((doc) => doc.primary)
		);
	await old.collections.coupons.initSearch('es', options);
	const otherIndex = 'products-search-v4-en_flexsearch';
	await old.addCollections({
		[otherIndex]: {
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: { id: { type: 'string', maxLength: 100 } },
				required: ['id'],
			},
		},
	});
	await old.collections[otherIndex].insert({ id: 'keep' });
	await old.close();

	const current = await open();
	try {
		await current.addCollections({ coupons: creators.coupons } as never);
		await waitFor(async () => {
			const names = (await getAllCollectionDocuments(current.internalStore)).map(
				(doc) => doc.data.name
			);
			expect(names.some((name) => name.startsWith('coupons-search-'))).toBe(false);
			expect(names).toContain(otherIndex);
		});
		const row = (await current.collections.coupons.findOne('saved-coupon').exec())!.toJSON();
		expect(row).toMatchObject({
			payload: { code: 'CAFÉ-123', description: 'Été offer' },
			searchFold: { code: 'cafe-123', description: 'ete offer' },
			sync: { revision: 'unchanged' },
			local: { dirty: true, pendingMutationIds: ['pending-edit'] },
		});
		await expect(current.collections.coupons.initSearch('fr', options)).resolves.toBeNull();
		const engine = {
			active: () => ({ database: current }),
			db$: () => () => {},
			ready: Promise.resolve(),
		} as unknown as RxdbSyncEngine;
		const result = await firstValueFrom(
			observeEngineQuery(engine, 'en', { collection: 'coupons', search: 'café' })
		);
		expect(result.hits.map((hit) => hit.id)).toEqual(['saved-coupon']);
		const literal = await firstValueFrom(
			observeEngineQuery(engine, 'en', { collection: 'coupons', search: 'fix-abc' })
		);
		expect(literal.hits.map((hit) => hit.id)).toEqual(['long-coupon']);
		const descriptionOnly = await firstValueFrom(
			observeEngineQuery(engine, 'en', {
				collection: 'coupons',
				search: 'cafe',
				searchFields: ['description'],
			})
		);
		expect(descriptionOnly.hits).toEqual([]);
		for (const search of queries) {
			const scanned = await firstValueFrom(
				observeEngineQuery(engine, 'en', { collection: 'coupons', search })
			);
			expect(scanned.hits.map((hit) => hit.id)).toEqual(previousAnswers.get(search));
		}
	} finally {
		await current.close();
	}
});
