import { map, type Observable } from 'rxjs';

import { degradedStorage$ } from '@wcpos/database/plugins/wrapped-error-handler-storage';

export { isStorageDegraded } from '@wcpos/database/plugins/wrapped-error-handler-storage';

/** App-wide storage health, including a synchronous first value for eager subscribers. */
export function observeStorageDegraded(): Observable<boolean> {
	return degradedStorage$.pipe(map((degraded) => degraded.length > 0));
}
