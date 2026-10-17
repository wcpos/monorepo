import { defer, type Observable, of } from 'rxjs';
import { startWith, switchMap } from 'rxjs/operators';

import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { observeBinding } from './engine-query';

import type { LegacyCollectionName } from './engine-adapter/collection-map';
import type { AdapterDatabase } from './engine-adapter/execute-query';

/** Each binding supplies its own placeholder, including the synchronous initial binding. */
export function observeResidentRead<T>(
	engine: RxdbSyncEngine,
	spec: {
		collections: (LegacyCollectionName | 'recordMutations')[];
		absent: T;
		read: (database: AdapterDatabase) => Observable<T>;
	}
): Observable<T> {
	return observeBinding(engine, spec.collections).pipe(
		switchMap((database) =>
			database ? defer(() => spec.read(database)).pipe(startWith(spec.absent)) : of(spec.absent)
		)
	);
}
