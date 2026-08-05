import { useObservableEagerState } from 'observable-hooks';

import { degradedStorage$ } from '@wcpos/database/plugins/wrapped-error-handler-storage';

/**
 * True while any open database has lost its RxDB storage worker (#163).
 *
 * Deliberately app-wide rather than scoped to the active store: the adapter
 * builds ONE worker storage for the whole app (`adapters/default/index.web.ts`
 * wraps a single module-scope `getWebNewStorage()`), and every database opened
 * from it shares that worker. A lost worker is therefore an app-wide condition,
 * and scoping this to the active scope would under-report it. That is also why
 * the loss takes barcode lookups down at the same moment as order writes — which
 * is what made the March 6 incident look like "scanning just stopped".
 *
 * The latch is one-shot for the lifetime of the database scope: a half-dead
 * worker still answers some calls, so a later success is not proof of recovery.
 * It clears when that scope's last storage instance unregisters. Note that a
 * same-site store switch may retain the outgoing database rather than disposing
 * it, in which case the signal correctly persists — the shared worker is still
 * broken. Recovery means reloading the app.
 *
 * This is a signal only — it does not gate writes. Blocking checkout/cart writes
 * during degraded storage is a separate product decision (see #163 discussion).
 */
export function useStorageDegraded(): boolean {
	const degraded = useObservableEagerState(degradedStorage$);
	return degraded.length > 0;
}
