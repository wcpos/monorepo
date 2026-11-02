import { type Observable } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

import { POS_META_KEYS } from '@wcpos/sync-core';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { engineCollection } from '../records/engine-collection';
import { observeResidentRead } from '../resident-read';

export type ObservedPaymentMethod = {
	payment_method?: string;
	payment_method_title?: string;
	indexMethods: string[];
};

/** Resident order titles and every split-tender index row; absent → []. */
export function observePaymentMethodHistory(
	engine: RxdbSyncEngine
): Observable<ObservedPaymentMethod[]> {
	return observeResidentRead<ObservedPaymentMethod[]>(engine, {
		collections: ['orders'],
		absent: [],
		read: (database) =>
			engineCollection(database, 'orders')!
				.find()
				.$.pipe(
					map((documents) =>
						documents.map(({ payload }) => ({
							payment_method: payload?.payment_method,
							payment_method_title: payload?.payment_method_title,
							indexMethods: (Array.isArray(payload?.meta_data) ? payload.meta_data : [])
								.filter(
									(entry) => entry?.key === POS_META_KEYS.paymentMethod && entry.value != null
								)
								.map((entry) => String(entry.value)),
						}))
					)
				),
	}).pipe(
		distinctUntilChanged(
			(previous, current) => JSON.stringify(previous) === JSON.stringify(current)
		)
	);
}
