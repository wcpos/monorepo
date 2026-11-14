import { useObservable, useObservableState } from 'observable-hooks';
import { of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { observeStoreByRemoteId, type ReadonlyStoreRecord } from '@wcpos/query/user-db';

import { useAppState } from '../../../contexts/app-state';
import { parseRemoteId } from './use-cashier-label';

interface StoreLabel {
	id: number | undefined;
	label: string;
	document: ReadonlyStoreRecord | undefined;
}

function rawLabel(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

/**
 * Resolve a remote POS store id to a display label from the user database.
 *
 * Store metadata stores the remote numeric store id, while the local stores collection is keyed by
 * localID, so this hook queries by the indexed remote `id` field and falls back to the raw id.
 */
export function useStoreLabel(value: unknown): StoreLabel {
	const id = parseRemoteId(value);
	const fallback = id === undefined ? rawLabel(value) : String(id);
	const { userDB } = useAppState();

	const store$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(([storeID, db]) => {
					if (storeID === undefined || !db) {
						return of(undefined);
					}

					return observeStoreByRemoteId(db, storeID);
				})
			),
		[id, userDB]
	);
	const store = useObservableState(store$, undefined);

	if (id === undefined) {
		return { id, label: fallback, document: undefined };
	}

	if (store) {
		return { id, label: store.name || fallback, document: store };
	}

	return { id, label: fallback, document: undefined };
}
