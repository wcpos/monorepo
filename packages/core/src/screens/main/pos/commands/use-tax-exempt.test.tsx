/** @jest-environment jsdom */
import { of } from 'rxjs';
import { renderHook } from '@testing-library/react';

import type { RxdbSyncEngine } from '@wcpos/sync-engine';
import { observeCatalogByWooIds } from '@wcpos/query';

import { waitForCouponReferences } from './coupon-continuation';
import {
	acquireReferenceDemandHandle,
	whenReferencesSettled,
} from '../../../../query/coupon-reference-demand';
import {
	useRepairTaxExempt,
	useSetTaxExempt,
	useTaxExemptDeps,
	useWcVersion,
} from './use-tax-exempt';
import { readCatalogTaxStatuses } from '../hooks/use-coupon-context';
import { setTaxExempt } from './tax-exempt';
import { presentActionRefusal } from '../../../../extensions/actions/present';

import type { CurrentOrderRecord } from '../contexts/current-order/context';

let site: { wc_version?: string } | undefined;
jest.mock('../../../../contexts/app-state', () => ({ useStoreSession: () => ({ site }) }));
const runtime = { engine: {} };
jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => runtime,
	observeCatalogByWooIds: jest.fn(),
	readCoverageGeneration: (_engine: unknown, collection: string) =>
		collection === 'coupons' ? 3 : 7,
	useDocField: (_site: typeof site, read: (value: NonNullable<typeof site>) => unknown) =>
		_site && read(_site),
}));

it('reads the site version, keeps the callback current, and returns empty when absent', () => {
	site = { wc_version: '11.2.1' };
	const { result, rerender } = renderHook(() => useWcVersion());
	const reader = result.current;
	expect(reader()).toBe('11.2.1');
	site = { wc_version: '11.3.0' };
	rerender();
	expect(result.current).toBe(reader);
	expect(reader()).toBe('11.3.0');
	site = undefined;
	rerender();
	expect(reader()).toBe('');
});

jest.mock('../../../../query/coupon-reference-demand', () => ({
	acquireReferenceDemandHandle: jest.fn(),
	whenReferencesSettled: jest.fn(),
}));

it('reference wait aborts at the foreground deadline and resolves false', async () => {
	jest.useFakeTimers();
	try {
		const release = jest.fn();
		jest
			.mocked(acquireReferenceDemandHandle)
			.mockReset()
			.mockReturnValue({ retain: () => release } as never);
		jest
			.mocked(whenReferencesSettled)
			.mockReset()
			.mockImplementationOnce(
				(_coupons, _categories, signal) =>
					new Promise((resolve) => signal.addEventListener('abort', () => resolve(false)))
			);
		const waiting = waitForCouponReferences({} as RxdbSyncEngine);
		jest.advanceTimersByTime(9_999);
		expect(release).not.toHaveBeenCalled();
		jest.advanceTimersByTime(1);
		await expect(waiting).resolves.toBe(false);
		expect(release).toHaveBeenCalledTimes(2);
	} finally {
		jest.useRealTimers();
	}
});

it.each([true, false, 'throw'])('reference wait releases both handles on %s', async (outcome) => {
	const releaseCoupons = jest.fn();
	const releaseCategories = jest.fn();
	const coupons = { retain: () => releaseCoupons };
	const categories = { retain: () => releaseCategories };
	jest
		.mocked(acquireReferenceDemandHandle)
		.mockReset()
		.mockReturnValueOnce(coupons as never)
		.mockReturnValueOnce(categories as never);
	const error = new Error('reference failed');
	jest.mocked(whenReferencesSettled).mockReset();
	if (outcome === 'throw') jest.mocked(whenReferencesSettled).mockRejectedValueOnce(error);
	else jest.mocked(whenReferencesSettled).mockResolvedValueOnce(outcome as boolean);
	const engine = {} as RxdbSyncEngine;
	const waiting = waitForCouponReferences(engine);
	if (outcome === 'throw') await expect(waiting).rejects.toBe(error);
	else await expect(waiting).resolves.toBe(outcome);
	expect(acquireReferenceDemandHandle).toHaveBeenNthCalledWith(1, engine, 'coupons', 3);
	expect(acquireReferenceDemandHandle).toHaveBeenNthCalledWith(2, engine, 'products/categories', 7);
	expect(whenReferencesSettled).toHaveBeenCalledWith(coupons, categories, expect.any(AbortSignal));
	expect(whenReferencesSettled).toHaveBeenCalledTimes(1);
	expect(releaseCoupons).toHaveBeenCalledTimes(1);
	expect(releaseCategories).toHaveBeenCalledTimes(1);
});

const localPatch = jest.fn();
const boundary = jest.fn();
const config = jest.fn();
const owns = jest.fn();
const report = jest.fn();
const ctx = {};
const actor = {};
jest.mock('./tax-exempt', () => ({ setTaxExempt: jest.fn() }));
jest.mock('./use-boundary-commit', () => ({ useBoundaryCommit: () => boundary }));
jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch }),
}));
jest.mock('../hooks/use-cart-config', () => ({ useCartConfigReader: () => config }));
jest.mock('../contexts/order-money-divergence', () => ({ useServerOwnsMoneyReader: () => owns }));
jest.mock('../contexts/order-engine-warnings', () => ({ useReportEngineWarnings: () => report }));
jest.mock('../hooks/use-action-context', () => ({ useActionContext: () => ({ ctx, actor }) }));
jest.mock('../../../../extensions/actions/present', () => ({ presentActionRefusal: jest.fn() }));

it.each(['user', 'repair'] as const)('returns refusal and presents only for %s', async (source) => {
	jest.mocked(presentActionRefusal).mockClear();
	const refusal = { deny: { reasonKey: 'pos_cart.tax_exempt_locked' } };
	jest.mocked(setTaxExempt).mockResolvedValueOnce(refusal);
	const order = { uuid: 'target' } as CurrentOrderRecord;
	const systemBoundary = jest.fn();
	const { result } = renderHook(() =>
		source === 'user' ? useSetTaxExempt() : useRepairTaxExempt(systemBoundary)
	);
	expect(await result.current(order, true)).toBe(refusal);
	expect(setTaxExempt).toHaveBeenLastCalledWith(
		expect.objectContaining({
			ctx,
			actor,
			localPatch,
			// The repair never completes a sale through the cashier's foreground flow.
			commitAtBoundary: source === 'user' ? boundary : expect.any(Function),
			configForOrder: config,
			serverOwnsMoney: owns,
			reportEngineWarnings: report,
		}),
		order,
		{ exempt: true, source, ...(source === 'repair' && { valid: expect.any(Function) }) }
	);
	if (source === 'user')
		expect(presentActionRefusal).toHaveBeenCalledWith(ctx, refusal, { orderId: 'target' });
	else expect(presentActionRefusal).not.toHaveBeenCalled();
});

it('memoizes deps and waits for references using the runtime engine', async () => {
	const continuation = await import('./coupon-continuation');
	const spy = jest.spyOn(continuation, 'waitForCouponReferences').mockResolvedValueOnce(true);
	try {
		const { result, rerender } = renderHook(() => useTaxExemptDeps());
		const deps = result.current;
		rerender();
		expect(result.current).toBe(deps);
		expect(await deps.references()).toBe(true);
		expect(spy).toHaveBeenCalledWith(runtime.engine);
	} finally {
		spy.mockRestore();
	}
});

it('resolves tax statuses by Woo product/variation ids rather than object identity', async () => {
	jest.mocked(observeCatalogByWooIds).mockReturnValueOnce(
		of({
			available: true,
			products: [
				{ remoteId: '1', payload: { tax_status: 'taxable' } },
				{ remoteId: '2', payload: { tax_status: '' } },
			],
			variations: [
				{ remoteId: '11', payload: { tax_status: 'none' } },
				{ remoteId: '12', payload: { tax_status: '' } },
			],
		}) as never
	);
	const lines = [
		{ product_id: 1, variation_id: 11 },
		{ product_id: 1 },
		{ product_id: 2 },
		{ product_id: 3 },
		// A variation with no status of its own, and one not resident yet, take the parent's.
		{ product_id: 1, variation_id: 12 },
		{ product_id: 1, variation_id: 13 },
	];
	const read = await readCatalogTaxStatuses(runtime.engine as RxdbSyncEngine, lines);
	expect(lines.map(read)).toEqual(['none', 'taxable', undefined, undefined, 'taxable', 'taxable']);
	expect(read({ product_id: 1, variation_id: 11 })).toBe('none');
	expect(observeCatalogByWooIds).toHaveBeenLastCalledWith(runtime.engine, {
		productIds: [1, 1, 2, 3, 1, 1],
		variationIds: [11, undefined, undefined, undefined, 12, 13],
	});
});
it('waits for the engine before reading the catalog', async () => {
	let opened = false;
	const engine = { ready: Promise.resolve().then(() => void (opened = true)) } as RxdbSyncEngine;
	jest.mocked(observeCatalogByWooIds).mockImplementationOnce(() => {
		expect(opened).toBe(true);
		return of({ available: true, products: [], variations: [] }) as never;
	});
	const read = await readCatalogTaxStatuses(engine, [{ product_id: 1 }]);
	expect(opened).toBe(true);
	expect(read({ product_id: 1 })).toBeUndefined();
});
it('returns undefined when catalog is unavailable', async () => {
	jest
		.mocked(observeCatalogByWooIds)
		.mockReturnValueOnce(of({ available: false, products: [], variations: [] }));
	const read = await readCatalogTaxStatuses(runtime.engine as RxdbSyncEngine, [{ product_id: 1 }]);
	expect(read({ product_id: 1 })).toBeUndefined();
});

it('threads the repair validity and coupons into its system boundary', async () => {
	const systemBoundary = jest.fn(async () => undefined);
	const valid = () => false;
	const order = { uuid: 'target' } as CurrentOrderRecord;
	const { result } = renderHook(() => useRepairTaxExempt(systemBoundary));
	await result.current(order, true, valid);
	const [deps, , input] = jest.mocked(setTaxExempt).mock.lastCall!;
	expect(input.valid).toBe(valid);
	const boundaryResult = {} as Parameters<typeof deps.commitAtBoundary>[1];
	const queue = {} as Parameters<typeof deps.commitAtBoundary>[2];
	const coupons = {
		context: { coupons: new Map(), productCategories: new Map() },
		missing: { deny: { reasonKey: 'missing' } },
	};
	await deps.commitAtBoundary(order, boundaryResult, queue, coupons);
	expect(systemBoundary).toHaveBeenCalledWith(order, boundaryResult, queue, coupons, valid);
});
