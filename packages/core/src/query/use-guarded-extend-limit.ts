import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { of } from 'rxjs';

import { useQueryState } from './query-state-store';

import type { QueryBinding } from './query-bindings';

const selectLimit = (state: { limit: number }): number => state.limit;
const NOT_PENDING$ = of(false);
const UNKNOWN_EXHAUSTED$ = of(null as boolean | null);

/**
 * The one paging verdict the guard and the products end footer both read (#1221 lineage).
 *
 * A short read (`resultCount < limit`) is the end unless the engine says more may exist
 * (`exhausted === false`: a filtered or deduped read can be short while the walk continues).
 * A full read always extends — even past an exhausted lane, which can hold more resident rows
 * than the limit (1.10.14, frikifunko 2026-09-15). While a declaration is pending neither
 * answer is final: `mayExtend` and `atEnd` are both false. `reason` is render state, not copy.
 */
export function getPagingVerdict(
	resultCount: number,
	limit: number,
	pending: boolean,
	exhausted: boolean | null
): {
	mayExtend: boolean;
	atEnd: boolean;
	reason: 'pending' | 'full-window' | 'more-possible' | 'short-read';
} {
	if (pending) {
		return { mayExtend: false, atEnd: false, reason: 'pending' };
	}
	if (resultCount >= limit) {
		return { mayExtend: true, atEnd: false, reason: 'full-window' };
	}
	if (exhausted === false) {
		return { mayExtend: true, atEnd: false, reason: 'more-possible' };
	}
	return { mayExtend: false, atEnd: true, reason: 'short-read' };
}

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
 * `exhausted: true` answers "does the SERVER have more?", not "is there more to SHOW?". Since
 * the search walk requests a dial-sized wire page even for a small window and persists every
 * row (#1935), a lane can end complete holding more rows than the screen's limit: a 13-hit
 * search on the Products page (limit 10) recorded all 13, the verdict read `true`, and the
 * guard refused to extend — the read stayed clipped at 10 with 3 resident rows never shown
 * (1.10.14, frikifunko 2026-09-15). So `exhausted` only ends paging when the read is SHORT:
 * a full read extends regardless, and the require-plane serves the wider declaration from the
 * complete lane without a wire request; the next read comes back short and paging stops.
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
		if (!getPagingVerdict(resultCount, limit, pending, exhausted).mayExtend) return;
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
