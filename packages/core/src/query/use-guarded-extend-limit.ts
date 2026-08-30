import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { of } from 'rxjs';

import { useQueryState } from './query-state-store';

import type { QueryBinding } from './query-bindings';

const selectLimit = (state: { limit: number }): number => state.limit;
const NOT_PENDING$ = of(false);
const UNKNOWN_EXHAUSTED$ = of(null as boolean | null);

/**
 * End-reached → extendLimit, guarded (#1221).
 *
 * A result shorter than the current limit means one of two things, and both forbid another
 * extension: the server has no more matching rows (a short page IS the end), or the fetch for
 * the current limit is still landing (the extension is already outstanding). Unguarded, the
 * virtualizer's end-reached churn (short/empty content, re-measure, ResizeObserver) grew the
 * limit on every fire; each growth recompiled the search demand, and every recompile aborted
 * the in-flight wire request and immediately re-issued an identical one.
 *
 * Once the outstanding fetch lands enough rows to fill the limit, the data change re-arms the
 * virtualizer's end-reached and the next fire extends again — so paging through a long result
 * set still walks limit-by-limit, one outstanding extension at a time.
 *
 * The short-page inference is only sound when the rows and the limit count the same thing.
 * The products grids break that: a search demand carries no filters, and its read renders
 * deduped parent rows — so 10 wire records routinely become 2 rows under a category pill, and
 * the guard read "2 < 10" as the end while the server held more (the blank gap under the
 * tiles, 2026-08-30). Where the binding can hand over the ENGINE's opinion — `exhausted` from
 * the search lane's coverage verdict, `pending` while a declaration is outstanding — that
 * opinion replaces the inference: extend until the walk ended on a short page, never while one
 * is in flight. `exhausted: null` means the engine has no opinion (no search lane, a walk that
 * failed, a browse window), and the short-page rule stands.
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
	return React.useCallback(() => {
		if (pending || exhausted === true) return;
		if (exhausted === null && resultCount < limit) return;
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
	const limit = useQueryState(selectLimit);
	const pending = useObservableState(binding?.pending$ ?? NOT_PENDING$, false);
	const exhausted = useObservableState(binding?.exhausted$ ?? UNKNOWN_EXHAUSTED$, null);
	const engine = React.useMemo(
		() => (binding ? { pending, exhausted } : undefined),
		[binding, exhausted, pending]
	);
	return useGuardedExtension(extendLimit, resultCount, limit, engine);
}
