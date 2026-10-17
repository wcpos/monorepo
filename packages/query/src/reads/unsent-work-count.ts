import { combineLatest, from, type Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { MUTATION_QUEUE_RXDB_COLLECTION, type RxdbSyncEngine } from '@wcpos/sync-engine';

import { observeResidentRead } from '../resident-read';

/** Whole queue minus coordination rows; snapshot probes execute fresh counts. */
export function observeUnsentWorkCount(
	engine: RxdbSyncEngine,
	{ snapshot = false } = {}
): Observable<number | null> {
	return observeResidentRead<number | null>(engine, {
		collections: [MUTATION_QUEUE_RXDB_COLLECTION],
		absent: null,
		read: (database) => {
			const queue = database.collections[MUTATION_QUEUE_RXDB_COLLECTION] as unknown as {
				count(query?: { selector: { status: string } }): {
					$: Observable<number>;
					exec(): Promise<number>;
				};
			};
			// SQLite's $ne hides absent statuses (legacy pending rows): subtract by equality.
			const all = queue.count();
			const internal = queue.count({ selector: { status: 'internal' } });
			return (
				snapshot
					? from(Promise.all([all.exec(), internal.exec()]))
					: combineLatest([all.$, internal.$])
			).pipe(map(([total, coordination]) => Math.max(0, total - coordination)));
		},
	});
}
