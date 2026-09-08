import * as React from 'react';

import { Observable, of, switchMap } from 'rxjs';

import { useQueryRuntime } from '@wcpos/query';
import {
	type EngineConflict,
	MUTATION_QUEUE_RXDB_COLLECTION,
	type RxdbSyncEngine,
} from '@wcpos/sync-engine';

import { clearOrderSaving, markOrderSaveRejected } from './checkout-mode';

type Database = NonNullable<ReturnType<RxdbSyncEngine['active']>>['database'];
type MutationCollection = {
	find(query: { selector: { status: { $in: string[] }; collectionName: { $eq: string } } }): {
		$: Observable<readonly (EngineConflict | { toJSON(): EngineConflict })[]>;
	};
};

export function useRejectedOrderSavesSync(): void {
	const { engine } = useQueryRuntime();
	// Synchronise the checkout hold with the external, durable RxDB dead-letter query.
	React.useEffect(() => {
		let previous = new Set<string>();
		const subscription = new Observable<Database | null>((subscriber) =>
			engine.db$((database) => subscriber.next(database))
		)
			.pipe(
				switchMap((database) => {
					if (!database) return of([]);
					const mutations = database.collections[
						MUTATION_QUEUE_RXDB_COLLECTION
					] as unknown as MutationCollection;
					return mutations.find({
						selector: {
							status: { $in: ['rejected', 'conflicted', 'needs-revision'] },
							collectionName: { $eq: 'orders' },
						},
					}).$;
				})
			)
			.subscribe((rows) => {
				const current = new Set<string>();
				for (const document of rows) {
					const row = 'toJSON' in document ? document.toJSON() : document;
					current.add(row.recordId);
					markOrderSaveRejected(row.recordId, {
						status: row.rejectedStatus ?? null,
						reason: row.rejectedReason ?? null,
						message: row.rejectedMessage ?? null,
					});
				}
				for (const recordId of previous) if (!current.has(recordId)) clearOrderSaving(recordId);
				previous = current;
			});
		return () => subscription.unsubscribe();
	}, [engine]);
}
