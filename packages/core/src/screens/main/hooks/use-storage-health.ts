import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import {
	degradedStorage$,
	isStorageDegraded,
} from '@wcpos/database/plugins/wrapped-error-handler-storage';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../contexts/translations';

const storageBlockLogger = getLogger(['wcpos', 'pos', 'storage-block']);

/**
 * The money paths blocked while storage is degraded (ruling R5, #163).
 * Used only as log context so an incident can be traced to the surface that
 * refused.
 */
export type MoneyPathSurface = 'checkout' | 'process-payment' | 'save-order' | 'void' | 'refund';

/**
 * Thrown by a blocked money path that has to reject rather than return quietly
 * — a caller awaiting it would otherwise treat the no-op as success and toast
 * one. `blockIfDegraded` has already surfaced the reason, so callers should
 * swallow this class instead of raising a second, less specific error.
 */
export class StorageBlockedError extends Error {
	constructor(surface: MoneyPathSurface) {
		super(`Blocked "${surface}": local storage is degraded`);
		this.name = 'StorageBlockedError';
	}
}

export function isStorageBlockedError(error: unknown): error is StorageBlockedError {
	return error instanceof StorageBlockedError;
}

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
 * The latch is one-shot and is NOT cleared by a store switch, Clear & Sync or a
 * collection reset: a half-dead worker still answers some calls, so neither a
 * later success nor a fresh database scope is proof of recovery, and the same
 * dead worker backs the successor scope. Recovery means reloading the app.
 */
export function useStorageDegraded(): boolean {
	const degraded = useObservableEagerState(degradedStorage$);
	return degraded.length > 0;
}

/**
 * Hard block for the money paths — checkout, order save, void and refund
 * (ruling R5, extended to refunds by follow-up ruling).
 *
 * A payment accepted for an order that cannot be persisted is cash in the drawer
 * with no local record, so these surfaces refuse outright rather than failing
 * halfway. A refund is the same hazard in reverse: cash handed back with nothing
 * to show for it. Browsing and cart edits stay alive: they already fail loudly
 * and losing them would strand the cashier mid-sale for no safety gain.
 *
 * Two layers, because they answer different questions:
 * - `storageDegraded` drives the rendered `disabled` state (re-renders on latch).
 * - `blockIfDegraded` re-reads the latch **synchronously** at call time, so a
 *   handler that started before the worker died — or that is resuming after an
 *   `await` — still refuses instead of completing into the void.
 */
export function useStorageMoneyPathGuard() {
	const storageDegraded = useStorageDegraded();
	const t = useT();

	const blockIfDegraded = React.useCallback(
		(surface: MoneyPathSurface, context: Record<string, unknown> = {}): boolean => {
			// Live read, not the render snapshot: the latch can fire mid-handler.
			if (!isStorageDegraded()) return false;

			storageBlockLogger.error(t('pos_cart.storage_unavailable_action_blocked'), {
				showToast: true,
				saveToDb: true,
				context: {
					errorCode: ERROR_CODES.LOCAL_DB_UNAVAILABLE,
					surface,
					...context,
				},
			});
			return true;
		},
		[t]
	);

	return { storageDegraded, blockIfDegraded };
}
