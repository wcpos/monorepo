import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { filter, startWith } from 'rxjs/operators';

import { storeCollections } from '@wcpos/database';
import type { StoreCollections } from '@wcpos/database';
import type { LegacyCollectionName } from '@wcpos/query';

import { useStoreSession } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';

export type CollectionKey = keyof typeof storeCollections | LegacyCollectionName;

/**
 * Hook to get a collection reference that auto-updates when the collection is reset.
 *
 * @example
 * const { collection } = useCollection('logs');
 *
 * How it works:
 * - Returns the current collection from storeDB
 * - Subscribes to `storeDB.reset$` (from reset-collection plugin)
 * - When collection is reset (via swapCollection or direct remove),
 *   this hook automatically receives the new collection reference
 *
 * Collection reset flow:
 * 1. swapCollection() cancels all queries/replications for the collection
 * 2. collection.remove() is called (instant, regardless of record count)
 * 3. reset-collection plugin re-creates the collection and emits on reset$
 * 4. This hook receives the new collection and triggers re-render
 * 5. Direct query bindings subscribe to engine db$ replacement.
 */
export const useCollection = <K extends keyof StoreCollections>(
	key: K
): { collection: StoreCollections[K]; collectionLabel: string } => {
	const t = useT();
	const { storeDB } = useStoreSession();

	/**
	 * Subscribe to reset$ to get the new collection reference when reset.
	 *
	 * `startWith` is load-bearing, and the dependency is `storeDB` rather than
	 * `storeDB.reset$`: `useObservableState`'s second argument is the INITIAL
	 * state, read once on first render. A store switch hands us a different
	 * database whose `reset$` never emits (nothing was reset), so without a
	 * synchronous first emission the hook kept returning the collection of the
	 * store the cashier had just left — the logger went on writing every entry
	 * into the previous store's `logs` while the logs table, which resolves
	 * `localDB.collections` on each render, correctly read the new one. The
	 * table simply stopped moving (#1542-adjacent; reported 2026-08-25).
	 */
	const collection$ = React.useMemo(
		() =>
			storeDB.reset$!.pipe(
				filter((collection: { name: string }) => collection.name === key),
				startWith(storeDB.collections[key])
			),
		[storeDB, key]
	);
	const collection = useObservableState(
		collection$,
		storeDB.collections[key]
	) as StoreCollections[K];

	/**
	 *
	 */
	const collectionLabel = React.useMemo(() => {
		switch (key) {
			case 'logs':
				return t('common.log');
			default:
				return t('common.document');
		}
	}, [t, key]);

	return { collection, collectionLabel };
};
