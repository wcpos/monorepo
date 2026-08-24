/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useUpdateFeeLine } from './use-update-fee-line';

const mockLocalPatch = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerSuccess = jest.fn();

let mockFeeLines: object[] = [];
let mockLineItems: object[] = [];
const mockOrder = {
	uuid: 'order-uuid',
	payload: { id: 17 },
	getLatest: () => ({
		payload: { id: 17 },
		toMutableJSON: () => ({
			payload: { fee_lines: mockFeeLines, line_items: mockLineItems },
		}),
	}),
};

jest.mock('@wcpos/utils/logger', () => {
	const logger = {
		get error() {
			return mockLoggerError;
		},
		get warn() {
			return mockLoggerWarn;
		},
		get info() {
			return mockLoggerInfo;
		},
		get success() {
			return mockLoggerSuccess;
		},
		with: () => logger,
	};
	return {
		getLogger: () => logger,
		getErrorMessage: (error: unknown) => {
			if (error instanceof Error) return error.message;
			return String(error);
		},
	};
});

jest.mock('@wcpos/utils/logger/generated/error-codes.generated', () => ({
	ERROR_CODES: { CART_UPDATE_FAILED: 'CART_UPDATE_FAILED' },
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

jest.mock('../../hooks/mutations/use-local-mutation', () => ({
	useLocalMutation: () => ({ localPatch: mockLocalPatch }),
}));

jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({ currentOrderRecord: mockOrder }),
}));

// Only the store settings are stubbed; the tax maths, the changes-merge and the
// percent basis all run for real, so this suite fails if the engine port stops
// behaving like the hook it replaced.
jest.mock('./use-cart-config', () => {
	const { createCartConfig } = jest.requireActual('@wcpos/order-math');
	const config = createCartConfig({
		rates: [],
		allRates: [],
		calcTaxes: true,
		pricesIncludeTax: false,
		taxRoundAtSubtotal: false,
		dp: 2,
		shippingTaxClass: '',
		taxClassSlugs: ['standard', 'reduced-rate', 'zero-rate'],
		calcDiscountsSequentially: false,
	});
	return { useCartConfig: () => config };
});

describe('useUpdateFeeLine', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockFeeLines = [];
		mockLineItems = [];
		mockLocalPatch.mockResolvedValue(true);
	});

	it('patches a recalculated matching fee line', async () => {
		mockFeeLines = [
			{
				name: 'Handling',
				meta_data: [{ key: '_woocommerce_pos_uuid', value: 'fee-1' }],
			},
		];
		const { result } = renderHook(() => useUpdateFeeLine());

		await act(async () => {
			await result.current.updateFeeLine('fee-1', { amount: '3' });
		});

		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: expect.objectContaining({ payload: expect.objectContaining({ id: 17 }) }),
			data: { fee_lines: [expect.objectContaining({ total: '3', total_tax: '0' })] },
		});
		// The changes-merge is the engine's now: `amount` has to land in pos_data, not
		// top-level, or the next recalculation reads the pre-edit amount back.
		const [{ data }] = mockLocalPatch.mock.calls[0];
		const posData = data.fee_lines[0].meta_data.find(
			(meta: { key: string }) => meta.key === '_woocommerce_pos_data'
		);
		expect(posData.value).toEqual(expect.objectContaining({ amount: '3', percent: false }));
		expect(mockLoggerWarn).not.toHaveBeenCalled();
	});

	it('computes a percentage fee from the SAME snapshot it patches', async () => {
		// The retired hook re-read the order with getLatest() in the middle of its own
		// arithmetic, so the basis could come from a newer cart than the one being written.
		// The basis is an explicit input now, taken from this snapshot's line items.
		mockLineItems = [
			{ product_id: 1, total: '80', total_tax: '8' },
			// Tombstoned: excluded from the basis, exactly as `product_id !== null` did.
			{ product_id: null, total: '999', total_tax: '99' },
		];
		mockFeeLines = [
			{
				name: '10% service charge',
				meta_data: [
					{ key: '_woocommerce_pos_uuid', value: 'fee-1' },
					{
						key: '_woocommerce_pos_data',
						value: { amount: '10', percent: true, percent_of_cart_total_with_tax: false },
					},
				],
			},
		];
		const { result } = renderHook(() => useUpdateFeeLine());

		await act(async () => {
			await result.current.updateFeeLine('fee-1', { percent_of_cart_total_with_tax: true });
		});

		// 10% of (80 + 8), the tombstoned line contributing nothing.
		const [{ data }] = mockLocalPatch.mock.calls[0];
		expect(data.fee_lines[0].total).toBe('8.8');
	});

	it('warns without patching when the fee line is absent', async () => {
		const { result } = renderHook(() => useUpdateFeeLine());

		await act(async () => {
			await result.current.updateFeeLine('missing', { amount: '3' });
		});

		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockLoggerWarn).toHaveBeenCalledWith(
			'Fee line update targeted a line that is no longer in the cart',
			{
				showToast: true,
				toast: { title: 'pos_cart.update_fee_not_found' },
				context: { uuid: 'missing', orderId: 17 },
			}
		);
	});
});
