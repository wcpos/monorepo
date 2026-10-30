/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import type { EngineRecord } from '@wcpos/query';
import { CreateScopeChangedTwiceError } from '@wcpos/query/mutations';

import { useCouponRecord } from './use-coupon-record';

const mockCreate = jest.fn();
const mockPatchRecord = jest.fn();
const mockLocalPatch = jest.fn();

jest.mock('../../hooks/mutations/use-mutation', () => ({
	useMutation: () => ({ create: mockCreate, patchRecord: mockPatchRecord }),
}));
jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
}));

const coupon = {
	uuid: 'coupon-1',
	payload: { code: 'SAVE10' },
} as unknown as EngineRecord<'coupons'>;

describe('useCouponRecord', () => {
	beforeEach(() => jest.resetAllMocks());

	it('catches the already-toasted scope-changed-twice create rejection', async () => {
		mockCreate.mockRejectedValue(new CreateScopeChangedTwiceError('coupons'));
		const { result } = renderHook(() => useCouponRecord());
		await expect(result.current.createCoupon({ code: 'SAVE10' })).resolves.toBeUndefined();
	});

	it('returns the created coupon for the screen to navigate back', async () => {
		mockCreate.mockResolvedValue(coupon);
		const { result } = renderHook(() => useCouponRecord());
		await expect(result.current.createCoupon({ code: 'SAVE10' })).resolves.toBe(coupon);
		expect(mockCreate).toHaveBeenCalledWith({ data: { code: 'SAVE10' }, awaitRemoteId: false });
	});

	it('does not report a save when the local write resolves undefined', async () => {
		mockLocalPatch.mockResolvedValue(undefined);
		const { result } = renderHook(() => useCouponRecord());
		await expect(result.current.saveCouponFields(coupon, { description: 'Updated' })).resolves.toBe(
			false
		);
	});

	it('reports a saved document so the form can push and toast', async () => {
		mockLocalPatch.mockResolvedValue({ document: coupon });
		const { result } = renderHook(() => useCouponRecord());
		await expect(result.current.saveCouponFields(coupon, { description: 'Updated' })).resolves.toBe(
			true
		);
		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: coupon,
			data: { description: 'Updated' },
		});
	});

	it('forwards local write rejection to the form error handler', async () => {
		const error = new Error('write failed');
		mockLocalPatch.mockRejectedValue(error);
		const { result } = renderHook(() => useCouponRecord());
		await expect(result.current.saveCouponFields(coupon, { description: 'Updated' })).rejects.toBe(
			error
		);
	});
});
