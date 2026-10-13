/**
 * The coupon replay's reference demand (#952, #963): the coupons and categories it scans as
 * residents, declared while a cart carries applied coupons, and the barriers the replay waits on.
 */
import * as React from 'react';

import {
	combineLatest,
	distinctUntilChanged,
	filter,
	firstValueFrom,
	from,
	map,
	Observable,
	race,
	switchMap,
	timer,
} from 'rxjs';

import {
	engineCollectionNameFor,
	NOT_ATTEMPTED,
	type QueryHandle,
	useQueryRuntime,
} from '@wcpos/query';

import {
	acquireDemandQueryHandle,
	acquireEmptyQueryHandle,
	canonicalQueryKey,
} from './query-handles';
import { compileQuery } from './query-state-translator';
import { useCoverageGeneration } from './scope-key';

/** How long the coupon replay waits for its reference pull before giving up on it. */
const COUPON_REFERENCE_SETTLE_TIMEOUT_MS = 10_000;

/**
 * How long the OFF-CRITICAL-PATH continuation keeps waiting after the foreground barrier
 * expired (#963). Generous, because nothing is blocked on it — but not forever: a wedged lane
 * must not leave a timer and a captured order document alive for the life of the session. The
 * next cart edit remains the ultimate self-heal.
 */
const COUPON_REFERENCE_BACKGROUND_TIMEOUT_MS = 3 * 60_000;
const COUPON_REFERENCE_REARM_BASE_MS = 500;
const COUPON_REFERENCE_REARM_MAX_MS = 10_000;

/** Emits `false` once the caller aborts; never completes otherwise (safe inside `race`). */
function whenAborted$(signal: AbortSignal): Observable<boolean> {
	return new Observable<boolean>((subscriber) => {
		const abort = () => {
			subscriber.next(false);
			subscriber.complete();
		};
		if (signal.aborted) {
			abort();
			return undefined;
		}
		signal.addEventListener('abort', abort);
		return () => signal.removeEventListener('abort', abort);
	});
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise<void>((resolve) => {
		const abort = () => {
			clearTimeout(timerId);
			resolve();
		};
		const timerId = setTimeout(() => {
			signal.removeEventListener('abort', abort);
			resolve();
		}, ms);
		signal.addEventListener('abort', abort, { once: true });
	});
}

/**
 * Resolve `fallback` if the caller aborts or the deadline passes before `promise` settles.
 *
 * The STANDING readiness promise has no deadline of its own and no cancellation — it is owned by
 * the handle's demand. A continuation that awaited it bare would hold its closure (and the order
 * document it captured) until the demand happened to settle, ignoring both its own abort and its
 * own cap. This bounds the wait without pretending the underlying work stopped.
 */
function withDeadline<T>(
	promise: Promise<T>,
	signal: AbortSignal,
	deadline: number,
	fallback: T
): Promise<T> {
	return new Promise<T>((resolve) => {
		let done = false;
		const finish = (value: T) => {
			if (done) return;
			done = true;
			clearTimeout(timerId);
			signal.removeEventListener('abort', onAbort);
			resolve(value);
		};
		const onAbort = () => finish(fallback);
		const timerId = setTimeout(() => finish(fallback), Math.max(0, deadline - Date.now()));
		if (signal.aborted) {
			finish(fallback);
			return;
		}
		signal.addEventListener('abort', onAbort, { once: true });
		void promise.then(
			(value) => finish(value),
			() => finish(fallback)
		);
	});
}

type ReferenceCollection = 'coupons' | 'products/categories';

/** The two reference reads the replay scans, every coupon and every category, as demands. */
function compileReference(collection: ReferenceCollection, id: string) {
	return collection === 'coupons'
		? compileQuery(
				'coupons',
				{ search: '', filters: {}, sort: { field: 'code', direction: 'asc' } },
				{ id }
			)
		: compileQuery(
				'products/categories',
				{ search: '', filters: {}, sort: { field: 'name', direction: 'asc' } },
				{ id }
			);
}

/**
 * One reference collection's demand as a handle, owned while the caller is mounted: a demand
 * handle while `enabled` (the declaration, its readiness and re-arm, the pull activity), the empty
 * handle otherwise (attempted, quiet, nothing declared). The coverage generation is in the key, so
 * a reset or scope switch is a new handle, declared before the old one releases.
 */
function useReferenceDemandHandle(
	collection: ReferenceCollection,
	enabled: boolean
): { handle: QueryHandle; generation: number } {
	const { engine } = useQueryRuntime();
	const generation = useCoverageGeneration(engine, engineCollectionNameFor(collection));
	const key = canonicalQueryKey(['coupon-replay', collection, generation, enabled]);
	const handle = React.useMemo(
		() =>
			enabled
				? acquireDemandQueryHandle(engine, key, (id) => compileReference(collection, id))
				: acquireEmptyQueryHandle(engine, key),
		[collection, enabled, engine, key]
	);
	React.useEffect(() => handle.retain(), [handle]);
	return { handle, generation };
}

/** The handle's pull activity, from its snapshot. */
function activeOf(handle: QueryHandle): Observable<boolean> {
	return handle.observe().pipe(
		map((snapshot) => snapshot.active),
		distinctUntilChanged()
	);
}

/**
 * Reference demand for replaying coupons already applied to the cart (#952).
 *
 * The coupon picker declares its own demand when it mounts, but coupon *replay*
 * does not go through a query at all: `useRecalculateCoupons` scans the resident
 * coupons collection for each applied code (throwing when one is missing) and the
 * resident categories collection to enrich product categories with their ancestors,
 * the way `wc_get_product_cat_ids()` does. Both scans are invisible to the
 * requirement bridge.
 *
 * Before #952 those collections were greedily seeded at boot, so the scans always
 * found their data. Now that reference lanes are on demand, a cart carrying coupon
 * lines has to declare that demand itself — otherwise re-opening an order with a
 * coupon on a device that never opened the picker fails to recalculate, and
 * category-restricted coupons silently mis-validate against an empty tree.
 *
 * Declared only while coupon lines are present, and collapsed by the engine's
 * existing `REFERENCE_REFRESH_DEDUPE_MS` window, so a coupon cart costs at most one
 * refresh per collection per dedupe window rather than a pull per cart edit.
 *
 * Declaring the demand is not enough on its own: it is asynchronous, and the replay is
 * driven by a cart edit that can land while the pull is still in flight. So this also
 * returns `whenSettled()`, the barrier the replay awaits before it scans — without it a
 * cashier who re-opens a coupon order and immediately changes a quantity still scans the
 * empty collections, which is the exact failure the demand exists to prevent.
 *
 * `whenSettled()` resolves `false` when the wait timed out rather than the pull settling.
 * The caller must NOT scan on `false`: the barrier's whole point is that the residents are
 * not trustworthy yet, and a deadline does not make them trustworthy. Bail instead — the
 * next cart edit re-runs the replay, by which time the pull has almost certainly landed.
 * Readiness is awaited before quietness so another owner's in-flight pull cannot be mistaken
 * for completion when these handles resolve `released` after a skipped-active declaration.
 *
 * `whenSettledInBackground(signal)` is the continuation for that `false` (#963): the same wait,
 * moved off the critical path so a pull that outran the foreground deadline still ends in a
 * replay instead of stranding the cashier on stale totals until the next edit. It differs from
 * the foreground barrier in exactly two ways — it is capped minutes rather than seconds, and it
 * reads the CoverageOutcome contract strictly. Ready-then-quiet is safe same-tab but not
 * cross-tab: a refresh handle can resolve `released` because ANOTHER tab owns the scheduler row,
 * and that tab's in-flight pull is invisible to this tab's activity counters, so the collections
 * go quiet while they are still empty. A release is therefore NOT-attempted here — the wait
 * re-declares after a backoff instead of firing on it.
 */
export function useAppliedCouponReferenceDemand(hasAppliedCoupons: boolean): {
	whenSettled: () => Promise<boolean>;
	whenSettledInBackground: (signal: AbortSignal) => Promise<boolean>;
	generation: number;
} {
	const { handle: coupons, generation: couponsGeneration } = useReferenceDemandHandle(
		'coupons',
		hasAppliedCoupons
	);
	const { handle: categories, generation: categoriesGeneration } = useReferenceDemandHandle(
		'products/categories',
		hasAppliedCoupons
	);
	// The re-arm identity the settlement keys its continuation on: a reset of either collection.
	const generation = couponsGeneration + categoriesGeneration;
	const quiet$ = React.useMemo(
		() =>
			combineLatest([activeOf(coupons), activeOf(categories)]).pipe(
				map(([couponsActive, categoriesActive]) => !couponsActive && !categoriesActive),
				filter(Boolean)
			),
		[categories, coupons]
	);
	return React.useMemo(
		() => ({
			// Bounded: cart math must never hang on sync, so the wait cannot be open-ended. The
			// deadline reports itself (`false`) instead of pretending the pull landed. The quiet
			// wait is INSIDE the race, so the deadline also ends it: left outside, a wedged lane
			// kept both handles read (alive) long after the cart unmounted.
			whenSettled: () =>
				firstValueFrom(
					race(
						from(Promise.all([coupons.whenReady(), categories.whenReady()])).pipe(
							switchMap(() => quiet$),
							map(() => true)
						),
						timer(COUPON_REFERENCE_SETTLE_TIMEOUT_MS).pipe(map(() => false))
					)
				),
			whenSettledInBackground: async (signal: AbortSignal): Promise<boolean> => {
				const deadline = Date.now() + COUPON_REFERENCE_BACKGROUND_TIMEOUT_MS;
				// First pass rides the STANDING declaration — the very pull the foreground gave
				// up on. `whenReady()` reads the demand's current declaration, so its retry is picked up too.
				// Bounded, because that promise answers to neither this abort nor this cap.
				let readiness = await withDeadline(
					Promise.all([coupons.whenReady(), categories.whenReady()]),
					signal,
					deadline,
					[NOT_ATTEMPTED, NOT_ATTEMPTED]
				);
				for (let attempt = 0; !signal.aborted && Date.now() < deadline; attempt += 1) {
					if (readiness.every(({ attempted }) => attempted)) {
						const remaining = deadline - Date.now();
						if (remaining <= 0) break;
						// Ready-then-quiet, same ordering as the foreground barrier: readiness is
						// proven for this tab, quietness rules out a sibling declaration still writing.
						return await firstValueFrom(
							race(
								quiet$.pipe(map(() => true)),
								timer(remaining).pipe(map(() => false)),
								whenAborted$(signal)
							)
						);
					}
					// `released` (or an abandoned declaration) proves nothing: another owner holds
					// the scheduler row and its pull is invisible here. Ask again after a backoff
					// rather than reading the release as a settle.
					await sleep(
						Math.min(COUPON_REFERENCE_REARM_BASE_MS * 2 ** attempt, COUPON_REFERENCE_REARM_MAX_MS),
						signal
					);
					if (signal.aborted || Date.now() >= deadline) break;
					const rearm = new AbortController();
					try {
						readiness = await withDeadline(
							Promise.all([
								coupons.declareOnce(rearm.signal),
								categories.declareOnce(rearm.signal),
							]),
							signal,
							deadline,
							[NOT_ATTEMPTED, NOT_ATTEMPTED]
						);
					} finally {
						rearm.abort();
					}
				}
				return false;
			},
			generation,
		}),
		[categories, coupons, generation, quiet$]
	);
}
