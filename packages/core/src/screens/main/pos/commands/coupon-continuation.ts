import { distinctUntilChanged, Observable, switchMap } from 'rxjs';

import type { RxdbSyncEngine } from '@wcpos/sync-engine';
import { readCoverageGeneration } from '@wcpos/query';

import {
	acquireReferenceDemandHandle,
	COUPON_REFERENCE_SETTLE_TIMEOUT_MS,
	whenReferencesSettled,
} from '../../../../query/coupon-reference-demand';

export type CouponReferences = { ready: boolean; generation: string };

/** Identity of the context read, excluding unrelated revision/aggregate writes. */
export function replayContentKey(order: {
	uuid: string;
	payload: Record<string, unknown>;
}): string {
	return JSON.stringify([
		order.uuid ?? null,
		order.payload.id ?? null,
		order.payload.status ?? null,
		order.payload.line_items ?? [],
		order.payload.fee_lines ?? [],
		order.payload.shipping_lines ?? [],
		order.payload.coupon_lines ?? [],
	]);
}

function retainCouponReferences(engine: RxdbSyncEngine) {
	const coupons = acquireReferenceDemandHandle(
		engine,
		'coupons',
		readCoverageGeneration(engine, 'coupons')
	);
	const categories = acquireReferenceDemandHandle(
		engine,
		'products/categories',
		readCoverageGeneration(engine, 'categories')
	);
	const releases = [coupons.retain(), categories.retain()];
	return { coupons, categories, release: () => releases.forEach((release) => release()) };
}

/** A tap waits the foreground deadline, not the helper's background one; false past it. */
export async function waitForCouponReferences(engine: RxdbSyncEngine): Promise<boolean> {
	const { coupons, categories, release } = retainCouponReferences(engine);
	const abort = new AbortController();
	const deadline = setTimeout(() => abort.abort(), COUPON_REFERENCE_SETTLE_TIMEOUT_MS);
	try {
		return await whenReferencesSettled(coupons, categories, abort.signal);
	} finally {
		clearTimeout(deadline);
		release();
	}
}

/** Subscription ownership belongs to the coordinator, not a cart component. */
export function couponReferences(engine: RxdbSyncEngine): Observable<CouponReferences> {
	return new Observable<string>((subscriber) => {
		const publish = () => {
			subscriber.next(
				[
					readCoverageGeneration(engine, 'coupons'),
					readCoverageGeneration(engine, 'categories'),
				].join(':')
			);
		};
		const off = engine.statusChanges(publish);
		publish();
		return off;
	}).pipe(
		distinctUntilChanged(),
		switchMap(
			(generation) =>
				new Observable<CouponReferences>((subscriber) => {
					const { coupons, categories, release } = retainCouponReferences(engine);
					const abort = new AbortController();
					subscriber.next({ ready: false, generation });
					const wait = async () => {
						let ready = false;
						while (!ready && !abort.signal.aborted)
							ready = await whenReferencesSettled(coupons, categories, abort.signal);
						if (!abort.signal.aborted) subscriber.next({ ready, generation });
					};
					void wait().catch((error) => subscriber.error(error));
					return () => {
						abort.abort();
						release();
					};
				})
		)
	);
}
