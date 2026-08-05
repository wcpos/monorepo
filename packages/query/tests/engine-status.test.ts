import type { EngineStatus, RxdbSyncEngine, SyncCollectionName } from '@wcpos/sync-engine';

import { observeCollectionActive } from '../src/engine-status';

const names: SyncCollectionName[] = [
	'orders',
	'products',
	'variations',
	'customers',
	'taxRates',
	'categories',
	'brands',
	'tags',
	'coupons',
];

it('shares one engine status subscription and publishes distinct collection activity', () => {
	let collections = Object.fromEntries(
		names.map((name) => [name, { active: false, coverageGeneration: 0 }])
	) as EngineStatus['collections'];
	const listeners = new Set<(status: EngineStatus) => void>();
	let subscriptionCount = 0;
	const engine = {
		statusChanges: (listener: (status: EngineStatus) => void) => {
			subscriptionCount += 1;
			listeners.add(listener);
			listener({ collections } as EngineStatus);
			return () => {
				listeners.delete(listener);
			};
		},
	} as RxdbSyncEngine;
	const products: boolean[] = [];
	const coupons: boolean[] = [];
	const productSubscription = observeCollectionActive(engine, 'products').subscribe((active) =>
		products.push(active)
	);
	const couponSubscription = observeCollectionActive(engine, 'coupons').subscribe((active) =>
		coupons.push(active)
	);

	expect(subscriptionCount).toBe(1);
	collections = {
		...collections,
		products: { ...collections.products, active: true },
	};
	for (const listener of listeners) listener({ collections } as EngineStatus);
	for (const listener of listeners) listener({ collections } as EngineStatus);
	expect(products).toEqual([false, true]);
	expect(coupons).toEqual([false]);

	productSubscription.unsubscribe();
	couponSubscription.unsubscribe();
});
