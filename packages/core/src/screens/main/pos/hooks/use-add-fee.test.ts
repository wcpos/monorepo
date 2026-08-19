/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useAddFee } from './use-add-fee';

const mockAddItemToOrder = jest.fn();
const mockCalculateFeeLineTaxesAndTotals = jest.fn();
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
		currentOrder: { uuid: 'order-uuid', id: 17, number: '17' },
	}),
}));

jest.mock('./use-add-item-to-order', () => ({
	useAddItemToOrder: () => ({ addItemToOrder: mockAddItemToOrder }),
}));

jest.mock('./use-calculate-fee-line-tax-and-totals', () => ({
	useCalculateFeeLineTaxAndTotals: () => ({
		calculateFeeLineTaxesAndTotals: mockCalculateFeeLineTaxesAndTotals,
	}),
}));

const fee = {
	name: 'Handling',
	amount: '4.50',
	percent: false,
	prices_include_tax: false,
	tax_class: '',
	tax_status: 'taxable' as const,
	meta_data: [{ key: 'source', value: 'cashier' }],
};

describe('useAddFee', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockCalculateFeeLineTaxesAndTotals.mockImplementation((line) => ({ ...line, total: '4.50' }));
		mockAddItemToOrder.mockResolvedValue(true);
	});

	it('adds the POS data metadata and logs success', async () => {
		const { result } = renderHook(() => useAddFee());

		await act(async () => {
			await result.current.addFee(fee);
		});

		expect(mockAddItemToOrder).toHaveBeenCalledWith(
			'fee_lines',
			expect.objectContaining({
				meta_data: expect.arrayContaining([
					expect.objectContaining({
						key: '_woocommerce_pos_data',
						value: {
							amount: '4.50',
							percent: false,
							prices_include_tax: false,
						},
					}),
				]),
			})
		);
		expect(mockLoggerInfo).toHaveBeenCalledWith('pos.fee_added', expect.any(Object));
		expect(mockLoggerError).not.toHaveBeenCalled();
	});

	it('reports a calculation error with its message in context', async () => {
		mockCalculateFeeLineTaxesAndTotals.mockImplementation(() => {
			throw new Error('boom');
		});
		const { result } = renderHook(() => useAddFee());

		await act(async () => {
			await result.current.addFee(fee);
		});

		expect(mockLoggerError).toHaveBeenCalledWith('Failed to add fee to cart', {
			showToast: true,
			code: 'CART_UPDATE_FAILED',
			toast: { title: 'pos.error_adding_fee_to_cart' },
			context: { feeName: 'Handling', error: 'boom' },
		});
	});
});
