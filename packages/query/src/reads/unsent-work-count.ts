import { from, type Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { MUTATION_QUEUE_RXDB_COLLECTION, type RxdbSyncEngine } from '@wcpos/sync-engine';

import { observeResidentRead } from '../resident-read';

/** Count work from one snapshot, including legacy rows with no status. */
export function observeUnsentWorkCount(
	engine: RxdbSyncEngine,
	{ snapshot = false } = {}
): Observable<number | null> {
	return observeResidentRead<number | null>(engine, {
		collections: [MUTATION_QUEUE_RXDB_COLLECTION],
		absent: null,
		read: (database) => {
			const queue = database.collections[MUTATION_QUEUE_RXDB_COLLECTION] as unknown as {
				find(): {
					$: Observable<{ status?: string }[]>;
					exec(): Promise<{ status?: string }[]>;
				};
			};
			const rows = queue.find();
			return (snapshot ? from(rows.exec()) : rows.$).pipe(
				map((items) => items.filter((row) => row.status !== 'internal').length)
			);
		},
	});
}
