import { type Observable } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { engineCollection } from '../records/engine-collection';
import { observeResidentRead } from '../resident-read';

interface MetaDataEntry {
	key?: string;
	value?: unknown;
}

export interface MetaProduct {
	meta_data?: MetaDataEntry[];
}

/**
 * Aggregate distinct, sorted meta_data keys from a list of products.
 */
export function collectMetaKeys(products: MetaProduct[]): string[] {
	const keys = new Set<string>();
	for (const product of products) {
		const meta = Array.isArray(product?.meta_data) ? product.meta_data : [];
		for (const entry of meta) {
			if (entry?.key) {
				keys.add(entry.key);
			}
		}
	}
	return Array.from(keys).sort((a, b) => a.localeCompare(b));
}

/** Distinct keys seen on resident products, including private keys; absent → []. */
export function observeProductMetaKeys(engine: RxdbSyncEngine): Observable<string[]> {
	return observeResidentRead<string[]>(engine, {
		collections: ['products'],
		absent: [],
		read: (database) =>
			engineCollection(database, 'products')!
				.find()
				.$.pipe(map((documents) => collectMetaKeys(documents.map(({ payload }) => payload)))),
	}).pipe(
		distinctUntilChanged(
			(previous, current) => JSON.stringify(previous) === JSON.stringify(current)
		)
	);
}
