import { BehaviorSubject } from 'rxjs';

import type { RxdbSyncEngine } from '@wcpos/sync-engine';

export function residentEngine(initial: unknown = null) {
	const databases = new BehaviorSubject(initial);
	const engine = {
		active: () => (databases.value ? { database: databases.value } : null),
		db$: (next: (database: unknown) => void) => {
			const subscription = databases.subscribe(next);
			return () => subscription.unsubscribe();
		},
		ready: new Promise(() => {}),
	} as unknown as RxdbSyncEngine;
	return { engine, databases };
}
