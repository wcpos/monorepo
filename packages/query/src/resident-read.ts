import { concat, defer, EMPTY, type Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { observeBinding } from './engine-query';

import type { LegacyCollectionName } from './engine-adapter/collection-map';
import type { AdapterDatabase } from './engine-adapter/execute-query';

/** Each binding supplies its placeholder (or no emission with EMPTY), including the initial binding. */
export function observeResidentRead<T>(
	engine: RxdbSyncEngine,
	spec: {
		collections: (LegacyCollectionName | 'recordMutations')[];
		absent: T | typeof EMPTY;
		read: (database: AdapterDatabase) => Observable<T>;
	}
): Observable<T> {
	const absent = spec.absent === EMPTY ? EMPTY : of(spec.absent as T);
	return observeBinding(engine, spec.collections).pipe(
		switchMap((database) =>
			database
				? concat(
						absent,
						defer(() => spec.read(database))
					)
				: absent
		)
	);
}
