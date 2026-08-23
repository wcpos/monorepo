/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useUpdateShippingLine } from './use-update-shipping-line';

const mockLocalPatch = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerSuccess = jest.fn();

let mockShippingLines: object[] = [];
const mockOrder = {
	uuid: 'order-uuid',
	payload: { id: 17 },
	getLatest: () => ({
		payload: { id: 17 },
		toMutableJSON: () => ({ payload: { shipping_lines: mockShippingLines } }),
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

// Only the store settings are stubbed; the tax maths and the changes-merge run for
// real, so this suite fails if the engine port stops behaving like the hook it replaced.
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
		calcDiscountsSequentially: false,
	});
	return { useCartConfig: () => config };
});

describe('useUpdateShippingLine', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockShippingLines = [];
		mockLocalPatch.mockResolvedValue(true);
	});

	it('patches a recalculated matching shipping line', async () => {
		mockShippingLines = [
			{
				method_title: 'Delivery',
				meta_data: [{ key: '_woocommerce_pos_uuid', value: 'shipping-1' }],
			},
		];
		const { result } = renderHook(() => useUpdateShippingLine());

		await act(async () => {
			await result.current.updateShippingLine('shipping-1', { amount: 3 });
		});

		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: expect.objectContaining({ payload: expect.objectContaining({ id: 17 }) }),
			data: {
				shipping_lines: [expect.objectContaining({ total: '3', total_tax: '0' })],
			},
		});
		// The changes-merge is the engine's now: `amount` has to land in pos_data, not
		// top-level, or the next recalculation reads the pre-edit amount back.
		const [{ data }] = mockLocalPatch.mock.calls[0];
		const posData = data.shipping_lines[0].meta_data.find(
			(meta: { key: string }) => meta.key === '_woocommerce_pos_data'
		);
		expect(posData.value).toEqual(expect.objectContaining({ amount: 3, tax_status: 'taxable' }));
		expect(mockLoggerWarn).not.toHaveBeenCalled();
	});

	it('warns without patching when the shipping line is absent', async () => {
		const { result } = renderHook(() => useUpdateShippingLine());

		await act(async () => {
			await result.current.updateShippingLine('missing', { amount: 3 });
		});

		expect(mockLocalPatch).not.toHaveBeenCalled();
		expect(mockLoggerWarn).toHaveBeenCalledWith(
			'Shipping line update targeted a line that is no longer in the cart',
			{
				showToast: true,
				toast: { title: 'pos_cart.update_shipping_not_found' },
				context: { uuid: 'missing', orderId: 17 },
			}
		);
	});
});
