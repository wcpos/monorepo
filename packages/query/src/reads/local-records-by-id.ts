import { map, type Observable, of } from 'rxjs';

import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { observeEngineQuery } from '../engine-query';

import type { PayloadOf } from '../records/engine-record';

/** Local Woo-id lookup only: no demand or loading state. An unbound scope answers []. */
export function observeLocalRecordsById<Name extends 'orders' | 'products' | 'products/categories'>(
	engine: RxdbSyncEngine,
	name: Name,
	ids: readonly number[]
): Observable<
	{ uuid: string; payload: PayloadOf<Name extends 'products/categories' ? 'categories' : Name> }[]
> {
	if (ids.length === 0) return of([]);
	return observeEngineQuery(engine, {
		collection: name,
		selector: { id: { $in: ids } },
		limit: Number.MAX_SAFE_INTEGER,
	}).pipe(
		map(({ hits }) =>
			hits.map(({ record }) => ({
				uuid: record.uuid,
				payload: record.payload as PayloadOf<
					Name extends 'products/categories' ? 'categories' : Name
				>,
			}))
		)
	);
}
