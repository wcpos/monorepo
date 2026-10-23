import * as React from 'react';

import { observeAwaitingStore } from '@wcpos/query/store-local';

import { useStoreSession } from '../../../../contexts/app-state';

const NONE: ReadonlySet<string> = new Set();

/** The orders the store has still to hear (ADR 0040 Decided 1 rule 1), live. */
function useAwaitingStore(): ReadonlySet<string> {
	const { storeDB } = useStoreSession();
	const [awaiting, setAwaiting] = React.useState(NONE);
	// The journals are an external store, subscribed as the tender subscribes to its commands.
	React.useEffect(() => {
		if (!storeDB) return;
		const subscription = observeAwaitingStore(storeDB).subscribe({
			next: setAwaiting,
			error: () => undefined,
		});
		return () => subscription.unsubscribe();
	}, [storeDB]);
	return awaiting;
}

/** This sale is taken but the store has not heard it: the receipt stage and chip mark it. */
export function useAwaitsStore(orderUuid: string): boolean {
	return useAwaitingStore().has(orderUuid);
}

/** How many sales the store has still to hear: the register bar's pill counts them. */
export function useAwaitingStoreCount(): number {
	return useAwaitingStore().size;
}
