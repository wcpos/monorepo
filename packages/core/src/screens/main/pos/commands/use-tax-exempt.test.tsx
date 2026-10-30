/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { waitForCouponReferences } from './coupon-continuation';
import {
	acquireReferenceDemandHandle,
	whenReferencesSettled,
} from '../../../../query/coupon-reference-demand';
import { useWcVersion } from './use-tax-exempt';

let site: { wc_version?: string } | undefined;
jest.mock('../../../../contexts/app-state', () => ({ useStoreSession: () => ({ site }) }));
jest.mock('@wcpos/query', () => ({
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
