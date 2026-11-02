import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { of } from 'rxjs';
import { catchError, startWith } from 'rxjs/operators';

import { observeAwaitingStore } from '@wcpos/query/store-local';

import { useStoreSession } from '../../../../contexts/app-state';

const NONE: ReadonlySet<string> = new Set();

/**
 * The orders the store has still to hear (ADR 0040 Decided 1 rule 1), from the store's one
 * shared stream: warm (the register bar holds it), a reader gets the set on its first render;
 * null only before the stream's first-ever answer, so a mark is never drawn from a guess.
 */
export function useAwaitingStore(): ReadonlySet<string> | null {
	const { storeDB } = useStoreSession();
	return useObservableEagerState(
		React.useMemo(
			() =>
				storeDB
					? observeAwaitingStore(storeDB).pipe(
							startWith(null),
							catchError(() => of(NONE))
						)
					: of(NONE),
			[storeDB]
		)
	);
}

/** This sale is taken but the store has not heard it (null: not read yet). */
export function useAwaitsStore(orderUuid: string): boolean | null {
	return useAwaitingStore()?.has(orderUuid) ?? null;
}

/** How many sales the store has still to hear: the register bar's pill counts them. */
export function useAwaitingStoreCount(): number {
	return useAwaitingStore()?.size ?? 0;
}
