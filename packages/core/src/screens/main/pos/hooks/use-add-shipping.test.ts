/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { calculateCartLine } from '@wcpos/order-math';

import { useAddShipping } from './use-add-shipping';

const mockAddItemToOrder = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerSuccess = jest.fn();

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

jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({
		currentOrderRecord: {
			uuid: 'order-uuid',
			payload: { id: 17, number: '17' },
			// The inheritance basis is read from here — an explicit input to the engine now.
			getLatest: () => ({ payload: { id: 17, line_items: [] } }),
		},
	}),
}));

jest.mock('./use-add-item-to-order', () => ({
	useAddItemToOrder: () => ({ addItemToOrder: mockAddItemToOrder }),
}));

// Only the store settings are stubbed; the tax maths runs for real.
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

// Real implementation, wrapped so one case can make it throw.
jest.mock('@wcpos/order-math', () => {
	const actual = jest.requireActual('@wcpos/order-math');
	return { ...actual, calculateCartLine: jest.fn(actual.calculateCartLine) };
});

const shipping = {
	method_title: 'Local delivery',
	method_id: 'local-delivery',
	amount: '8.00',
	prices_include_tax: false,
	tax_status: 'taxable' as const,
	meta_data: [{ key: 'source', value: 'cashier' }],
};

describe('useAddShipping', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockAddItemToOrder.mockResolvedValue(true);
	});

	it('adds the POS data metadata and logs success', async () => {
		const { result } = renderHook(() => useAddShipping());

		await act(async () => {
			await result.current.addShipping(shipping);
		});

		expect(mockAddItemToOrder).toHaveBeenCalledWith(
			'shipping_lines',
			expect.objectContaining({
				meta_data: expect.arrayContaining([
					expect.objectContaining({
						key: '_woocommerce_pos_data',
						value: {
							amount: '8.00',
							prices_include_tax: false,
							tax_status: 'taxable',
						},
					}),
				]),
			})
		);
		expect(mockLoggerInfo).toHaveBeenCalledWith('pos.shipping_added', expect.any(Object));
		expect(mockLoggerError).not.toHaveBeenCalled();
	});

	it('reports a calculation error with its message in context', async () => {
		(calculateCartLine as unknown as jest.Mock).mockImplementationOnce(() => {
			throw new Error('boom');
		});
		const { result } = renderHook(() => useAddShipping());

		await act(async () => {
			await result.current.addShipping(shipping);
		});

		expect(mockLoggerError).toHaveBeenCalledWith('Failed to add shipping to cart', {
			showToast: true,
			code: 'CART_UPDATE_FAILED',
			toast: { title: 'pos.error_adding_shipping_to_cart' },
			context: {
				methodTitle: 'Local delivery',
				methodId: 'local-delivery',
				error: 'boom',
			},
		});
	});
});
