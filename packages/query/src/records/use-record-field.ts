import { useObservable, useObservableEagerState } from 'observable-hooks';
import { combineLatest, defer, type Observable, of } from 'rxjs';
import { distinctUntilChanged, map, startWith, switchMap } from 'rxjs/operators';
import { deepEqual } from 'rxdb/plugins/utils';

import type { RxDocument } from 'rxdb';

/**
 * THE field-reactivity idiom (ADR 0028): one hook family owns observable identity and
 * deep-equality dedupe, so RxDB's reactivity is consumed natively without wrappers, caches,
 * or per-render resubscription.
 *
 * Why this exists (verified against RxDB 17.4.0):
 *  - `doc.$` / `doc.get$()` are getters returning a FRESH observable object per access, and
 *    `useObservableEagerState` keys its subscription on observable identity — raw
 *    `get$`-into-hook resubscribes every render.
 *  - dev-mode `get$(path)` throws DOC4 for schema-undeclared paths, and payload interiors
 *    are deliberately undeclared — so a path-string API cannot reach the payload.
 *
 * The contract:
 *  - the underlying document subscription is torn down ONLY when the source identity
 *    changes — never because the caller passed an inline selector or re-rendered;
 *  - selector updates apply from the next evaluation (the latest selector always runs);
 *  - emissions dedupe with `deepEqual`, matching RxDB's own `get$` semantics;
 *  - the first value is delivered synchronously (no loading flash, Suspense-compatible).
 */

type Selector<TData, R> = (data: TData) => R;

/** Duck-type for RxState containers (`uiSettings`, app state): reactive `$` + plain `get()`. */
type RxStateLike<TState> = {
	$: Observable<TState>;
	get: () => TState;
	collection?: undefined;
};

function isRxDocumentLike(value: unknown): value is RxDocument<Record<string, unknown>> {
	return (
		typeof value === 'object' &&
		value !== null &&
		'collection' in value &&
		typeof (value as { getLatest?: unknown }).getLatest === 'function'
	);
}

/**
 * Core: a stable value stream over [source, selector] inputs. `useObservable` keeps ONE
 * outer observable for the component's lifetime; new inputs are pushed through `inputs$`,
 * so the document subscription survives re-renders and inline selectors by construction.
 */
function useSelectedValue<TSource, TData, R>(
	source: TSource | null | undefined,
	select: Selector<TData, R>,
	toData$: (source: TSource) => Observable<TData>
): R | undefined {
	const value$ = useObservable(
		(inputs$: Observable<[TSource | null | undefined, Selector<TData, R>]>) => {
			const data$ = inputs$.pipe(
				map(([input]) => input),
				// Resubscribe the source ONLY on source identity change — a re-render with a
				// new inline selector must not reach this line's switchMap.
				distinctUntilChanged(),
				switchMap((input) => (input == null ? of(undefined) : toData$(input)))
			);
			const select$ = inputs$.pipe(map(([, selector]) => selector));
			return combineLatest([data$, select$]).pipe(
				map(([data, selector]) => (data === undefined ? undefined : selector(data as TData))),
				distinctUntilChanged(deepEqual)
			);
		},
		[source, select] as [TSource | null | undefined, Selector<TData, R>]
	);
	return useObservableEagerState(value$);
}

/**
 * Read a selected slice of an RxDocument reactively.
 *
 *   const total = useRecordField(order, (o) => o.payload.total);
 *
 * Inline selectors are fine — they never cost a resubscription. Passing `null`/`undefined`
 * yields `undefined` (for optional mounts, e.g. no selected order).
 */
export function useRecordField<TDoc extends Record<string, unknown>, R>(
	record: RxDocument<TDoc>,
	select: Selector<TDoc, R>
): R;
export function useRecordField<TDoc extends Record<string, unknown>, R>(
	record: RxDocument<TDoc> | null | undefined,
	select: Selector<TDoc, R>
): R | undefined;
export function useRecordField<TDoc extends Record<string, unknown>, R>(
	record: RxDocument<TDoc> | null | undefined,
	select: Selector<TDoc, R>
): R | undefined {
	return useSelectedValue(record, select, recordData$);
}

/**
 * The same idiom for non-record reactive containers: raw RxDocuments outside the engine
 * (`store`, `wpCredentials`) and RxState (`uiSettings`). This is the replacement for every
 * `useObservableEagerState(x.<field>$)` call site — those getters mint a fresh observable
 * per render and resubscribe each time (the app-wide churn class behind #1250).
 */
export function useDocField<TState extends Record<string, unknown>, R>(
	source: RxDocument<TState> | RxStateLike<TState>,
	select: Selector<TState, R>
): R;
export function useDocField<TState extends Record<string, unknown>, R>(
	source: RxDocument<TState> | RxStateLike<TState> | null | undefined,
	select: Selector<TState, R>
): R | undefined;
export function useDocField<TState extends Record<string, unknown>, R>(
	source: RxDocument<TState> | RxStateLike<TState> | null | undefined,
	select: Selector<TState, R>
): R | undefined {
	return useSelectedValue(source, select, sourceData$);
}

/**
 * Non-React face of the same contract, for feeds and pipelines (e.g. the order-math feed):
 * one subscription per call, deepEqual-deduped, synchronous first value.
 */
export function observeRecordField<TDoc extends Record<string, unknown>, R>(
	record: RxDocument<TDoc>,
	select: Selector<TDoc, R>
): Observable<R> {
	return recordData$(record).pipe(map(select), distinctUntilChanged(deepEqual));
}

function recordData$<TDoc extends Record<string, unknown>>(
	record: RxDocument<TDoc>
): Observable<TDoc> {
	// One access of the `$` getter per subscription — the emitted instances come from RxDB's
	// doc-cache (rev-deduped), and `toJSON()` exposes the immutable data without meta fields.
	return record.$.pipe(map((latest) => latest.toJSON() as TDoc));
}

function sourceData$<TState extends Record<string, unknown>>(
	source: RxDocument<TState> | RxStateLike<TState>
): Observable<TState> {
	if (isRxDocumentLike(source)) {
		return recordData$(source as RxDocument<TState>);
	}
	// RxState's `$` is not guaranteed to emit synchronously on subscribe; the eager-state
	// contract needs a sync first value, so seed with the current state (deduped downstream).
	const state = source as RxStateLike<TState>;
	return defer(() => state.$.pipe(startWith(state.get())));
}
