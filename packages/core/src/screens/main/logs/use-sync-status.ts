import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { from } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import type { CensusTotal, CensusTotals, EngineCollectionCounts } from '@wcpos/query';

import { useAppState } from '../../../contexts/app-state';

import type { Observable } from 'rxjs';

/**
 * Shape of the per-store sync-status state doc, written by the app layer (see
 * apps/main/lib/sync-status.ts). Duplicated here deliberately — the core package
 * must not import from the app layer.
 */
export type CollectionSyncStatus = {
	lastCheckedAt: number | null;
	lastChangedAt: number | null;
	lastError: { at: number; type: string; message: string } | null;
};

export type SyncStatusState = Record<string, CollectionSyncStatus>;

/** RxDB state key the app layer persists the sync status under. */
export const SYNC_STATUS_STATE_KEY = 'sync_status_v1';

/**
 * v1 collections surfaced in the strip, in telemetry (snake_case) naming — the
 * same keys the status doc is written under.
 */
export const SYNC_STATUS_CARDS = [
	'products',
	'variations',
	'customers',
	'orders',
	'tax_rates',
] as const;

/** Telemetry names match the engine-DB camelCase keys except for tax rates. */
const TELEMETRY_TO_ENGINE_KEY: Record<string, string> = { tax_rates: 'taxRates' };

export type SyncStatusCard = {
	/** Telemetry (snake_case) collection name — also the log search term. */
	collection: string;
	lastCheckedAt: number | null;
	lastError: CollectionSyncStatus['lastError'];
	localCount: number;
	/** Server total, only when an authoritative fresh census exists (else null). */
	serverTotal: number | null;
};

/**
 * Join the status doc with live engine census + local counts into one card per
 * v1 collection. `serverTotal` follows the health screen's honesty contract:
 * populated only from a fresh census, never inferred from the local count.
 */
export function deriveSyncStatusCards(
	doc: SyncStatusState,
	census: CensusTotals,
	counts: EngineCollectionCounts
): SyncStatusCard[] {
	return SYNC_STATUS_CARDS.map((collection) => {
		const status = doc[collection] ?? null;
		const engineKey = TELEMETRY_TO_ENGINE_KEY[collection] ?? collection;
		const censusEntry = (census as Record<string, CensusTotal | null>)[engineKey] ?? null;
		return {
			collection,
			lastCheckedAt: status?.lastCheckedAt ?? null,
			lastError: status?.lastError ?? null,
			localCount: counts[engineKey] ?? 0,
			serverTotal: censusEntry && censusEntry.fresh ? censusEntry.total : null,
		};
	});
}

/**
 * The status doc is acquired asynchronously (storeDB.addState), so expose it as
 * an ObservableResource — the house style for async data — created once per store
 * and consumed under Suspense. Kept separate from the suspending component so the
 * resource identity survives Suspense retries.
 */
/** The slice of the RxDB state handle this hook depends on. */
type SyncStatusRxState = { get$(path: string): Observable<SyncStatusState | undefined> };

export function useSyncStatusResource(): ObservableResource<SyncStatusState> {
	const { storeDB } = useAppState();
	return React.useMemo(() => {
		const statePromise = storeDB.addState(SYNC_STATUS_STATE_KEY) as Promise<SyncStatusRxState>;
		const doc$: Observable<SyncStatusState> = from(statePromise).pipe(
			switchMap((state) => state.get$('')),
			// The doc is empty/undefined until the first sync event — treat as all-null.
			map((doc) => doc ?? {})
		);
		return new ObservableResource(doc$);
	}, [storeDB]);
}

export function useSyncStatusDoc(resource: ObservableResource<SyncStatusState>): SyncStatusState {
	return useObservableSuspense(resource);
}
