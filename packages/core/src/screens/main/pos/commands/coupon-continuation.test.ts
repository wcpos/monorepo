import { BehaviorSubject, firstValueFrom } from 'rxjs';

import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { couponReferences } from './coupon-continuation';
import { acquireReferenceDemandHandle } from '../../../../query/coupon-reference-demand';

const ready = { attempted: true };
const released = { attempted: false };
const handles = new Map<string, ReturnType<typeof handle>>();
function handle() {
	const readiness = new BehaviorSubject(released);
	const activity = new BehaviorSubject({ active: false });
	let owners = 0;
	return {
		readiness,
		activity,
		owners: () => owners,
		retain: () => {
			owners++;
			return () => {
				owners--;
			};
		},
		observe: () => activity,
		whenReady: () => firstValueFrom(readiness),
		declareOnce: () => firstValueFrom(readiness),
	};
}
jest.mock('@wcpos/query/query-state', () => ({
	canonicalQueryKey: JSON.stringify,
	acquireDemandQueryHandle: (_engine: unknown, key: string) => {
		if (!handles.has(key)) handles.set(key, handle());
		return handles.get(key);
	},
}));
const statuses = new BehaviorSubject(0);
const engine = {
	status: () => ({
		collections: {
			coupons: { coverageGeneration: statuses.value },
			categories: { coverageGeneration: 0 },
		},
	}),
	statusChanges: (notify: () => void) => {
		const sub = statuses.subscribe(notify);
		return () => sub.unsubscribe();
	},
} as unknown as RxdbSyncEngine;
beforeEach(() => {
	handles.clear();
	statuses.next(0);
	jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

it('#963 shares retained handles with the hook; release is not readiness; outlives the hook deadline and releases on reset/teardown', async () => {
	const hook = acquireReferenceDemandHandle(engine, 'coupons', 0);
	const releaseHook = hook.retain();
	const values: boolean[] = [];
	const sub = couponReferences(engine).subscribe((value) => values.push(value.ready));
	expect(handles.size).toBe(2);
	const [coupons, categories] = [...handles.values()];
	expect(coupons.owners()).toBe(2);
	releaseHook();
	await jest.advanceTimersByTimeAsync(180_001);
	expect(values).toEqual([false]);
	coupons.readiness.next(ready);
	categories.readiness.next(ready);
	categories.activity.next({ active: true });
	await jest.advanceTimersByTimeAsync(20_000);
	expect(values).toEqual([false]);
	categories.activity.next({ active: false });
	await jest.advanceTimersByTimeAsync(0);
	expect(values).toEqual([false, true]);
	statuses.next(1);
	expect(values).toEqual([false, true, false]);
	expect(coupons.owners()).toBe(0);
	sub.unsubscribe();
	expect([...handles.values()].every((h) => h.owners() === 0)).toBe(true);
	expect(statuses.observed).toBe(false);
	expect(jest.getTimerCount()).toBe(0);
});
