import * as React from 'react';

import { observeAwaitingStore } from '@wcpos/query/store-local';

import { useStoreSession } from '../../../../contexts/app-state';

const NONE: ReadonlySet<string> = new Set();

/** The orders the store has still to hear (ADR 0040 Decided 1 rule 1), live; null until the
 *  journals first answer, so a mark is never drawn from a guess. No store database: none. */
function useAwaitingStore(): ReadonlySet<string> | null {
	const { storeDB } = useStoreSession();
	const [read, setRead] = React.useState<{ db: unknown; awaiting: ReadonlySet<string> }>();
	React.useEffect(() => {
		if (!storeDB) return;
		const subscription = observeAwaitingStore(storeDB).subscribe({
			next: (awaiting) => setRead({ db: storeDB, awaiting }),
			error: () => setRead({ db: storeDB, awaiting: NONE }),
		});
		return () => subscription.unsubscribe();
	}, [storeDB]);
	if (!storeDB) return NONE;
	return read?.db === storeDB ? read.awaiting : null;
}

/** This sale is taken but the store has not heard it (null: not read yet). */
export function useAwaitsStore(orderUuid: string): boolean | null {
	return useAwaitingStore()?.has(orderUuid) ?? null;
}

/** How many sales the store has still to hear: the register bar's pill counts them. */
export function useAwaitingStoreCount(): number {
	return useAwaitingStore()?.size ?? 0;
}
