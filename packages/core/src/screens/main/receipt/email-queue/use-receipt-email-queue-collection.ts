import * as React from 'react';

import type { ReceiptEmailQueueCollection } from '@wcpos/database';

import { useAppState } from '../../../../contexts/app-state';

import type { Observable } from 'rxjs';

const COLLECTION_NAME = 'receipt_email_queue';

type ResetEvent = { name: string; database?: unknown };

type StoreDatabaseLike = {
	reset$?: Observable<ResetEvent>;
	collections?: Record<string, ReceiptEmailQueueCollection | undefined>;
};

/**
 * The receipt email queue for the CURRENT store, or undefined while there is no
 * store database (logged out, mid store switch).
 *
 * This is `useCollection` minus its assumption that a store database is always
 * present: the drain bridge mounts above the screens that guarantee one, and a
 * hook that threw during a store switch would take the app down with it.
 *
 * The live database is read every render rather than latched, because
 * `useObservableState`'s initial value is applied on mount only — latching it
 * would keep serving the OUTGOING store's collection after a switch, draining
 * the wrong queue and inserting new rows into the wrong database. A reset
 * overrides that base, but only while it still belongs to the database on
 * screen: the swap carries the database it came from, so a stale override is
 * discarded during render instead of being cleared by an effect. The same
 * identity check is applied at the subscription, because `reset$` is one
 * process-wide subject shared by every open store scope.
 */
export function useReceiptEmailQueueCollection(): ReceiptEmailQueueCollection | undefined {
	const { storeDB } = useAppState() as { storeDB?: StoreDatabaseLike };
	const [swap, setSwap] = React.useState<{
		database: StoreDatabaseLike;
		collection: ReceiptEmailQueueCollection;
	} | null>(null);

	React.useEffect(() => {
		// Effect (last resort per project.mdc): reset$ is an imperative RxDB
		// notification with no render-derivable value.
		const database = storeDB;
		const subscription = database?.reset$?.subscribe((collection: ResetEvent) => {
			if (collection.name !== COLLECTION_NAME) return;
			// Another open store's reset must not swap this store's collection.
			if (collection.database !== undefined && collection.database !== database) return;
			setSwap({ database, collection: collection as unknown as ReceiptEmailQueueCollection });
		});
		return () => subscription?.unsubscribe();
	}, [storeDB]);

	if (swap && swap.database === storeDB) return swap.collection;
	return storeDB?.collections?.[COLLECTION_NAME];
}
