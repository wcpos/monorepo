import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { of } from 'rxjs';

import { useQueryState } from './query-state-store';

import type { QueryBinding } from './query-bindings';

const selectLimit = (state: { limit: number }): number => state.limit;
const NOT_PENDING$ = of(false);
const UNKNOWN_EXHAUSTED$ = of(null as boolean | null);

export type PagingVerdict = 'pending' | 'extend' | 'end';

/**
 * The one paging verdict the guard and the products end footer both read (#1221 lineage).
 *
 * A short read (`hitCount < limit`) is the end unless the engine says more may exist
 * (`exhausted === false`: a filtered or deduped read can be short while the walk continues).
 * A full read always extends — even past an exhausted lane, which can hold more resident rows
 * than the limit (1.10.14, frikifunko 2026-09-15). While a declaration is pending neither
 * answer is final: the three states are 'pending', 'extend', and 'end'. `exhausted: null` means
 * the engine has no opinion (no search lane, a failed walk, a browse window) and the short-read
 * rule stands.
 */
export function getPagingVerdict({
	hitCount,
	limit,
	pending,
	exhausted,
}: {
	hitCount: number;
	limit: number;
	pending: boolean;
	exhausted: boolean | null;
}): PagingVerdict {
	if (pending) {
		return 'pending';
	}
	if (hitCount >= limit) {
		return 'extend';
	}
	if (exhausted === false) {
		return 'extend';
	}
	return 'end';
}

export function usePagingVerdict(
	hitCount: number,
	binding?: Pick<QueryBinding, 'pending$' | 'exhausted$'>
): { verdict: PagingVerdict; limit: number; pending: boolean; exhausted: boolean | null } {
	const limit = useQueryState(selectLimit);
	const pending = useObservableState(binding?.pending$ ?? NOT_PENDING$, false);
	const exhausted = useObservableState(binding?.exhausted$ ?? UNKNOWN_EXHAUSTED$, null);
	return {
		verdict: getPagingVerdict({ hitCount, limit, pending, exhausted }),
		limit,
		pending,
		exhausted,
	};
}

/**
 * End-reached → extendLimit, guarded (#1221).
 *
 * See {@link getPagingVerdict} for the paging predicate. The latch schedules at most one
 * extension until the owner publishes the new limit. This prevents end-reached churn from
 * repeatedly recompiling search demand and aborting/reissuing the in-flight request (#1221).
 *
 * `limit` is a parameter rather than a store read because the same guard serves two owners of
 * a limit: the query-state store (the grids) and `useSearchSelect`'s local paging state (the
 * comboboxes, which have no store).
 */
export function useGuardedExtension(
	extendLimit: () => void,
	resultCount: number,
	limit: number,
	engine?: { pending: boolean; exhausted: boolean | null }
): () => void {
	const extensionScheduled = React.useRef(false);
	React.useEffect(() => {
		extensionScheduled.current = false;
	}, [limit]);
	const pending = engine?.pending ?? false;
	const exhausted = engine?.exhausted ?? null;
	// Primitive input changes re-arm settled empty lists through callback identity.
	return React.useCallback(() => {
		if (getPagingVerdict({ hitCount: resultCount, limit, pending, exhausted }) !== 'extend') return;
		if (extensionScheduled.current) return;
		extensionScheduled.current = true;
		extendLimit();
	}, [exhausted, extendLimit, limit, pending, resultCount]);
}

/**
 * The store-backed binding of {@link useGuardedExtension} — the grids' end-reached handler.
 *
 * The handler's identity is what the virtualizers key their end-reached subscription on (a new
 * handler re-runs the "am I at the end?" check), so it must change only when an input changes:
 * the engine opinion is read as two primitives, never rebuilt as an object per render.
 */
export function useGuardedExtendLimit(
	extendLimit: () => void,
	resultCount: number,
	binding?: Pick<QueryBinding, 'pending$' | 'exhausted$'>
): () => void {
	const { limit, pending, exhausted } = usePagingVerdict(resultCount, binding);
	const engine = React.useMemo(
		() => (binding ? { pending, exhausted } : undefined),
		[binding, exhausted, pending]
	);
	return useGuardedExtension(extendLimit, resultCount, limit, engine);
}
