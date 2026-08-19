/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useUpdateShippingLine } from './use-update-shipping-line';

const mockLocalPatch = jest.fn();
const mockCalculateShippingLineTaxesAndTotals = jest.fn();
const mockGetShippingLineData = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerSuccess = jest.fn();

let mockShippingLines: object[] = [];
const mockOrder = {
	id: 17,
	getLatest: () => ({
		id: 17,
		toMutableJSON: () => ({ shipping_lines: mockShippingLines }),
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
	useCurrentOrder: () => ({ currentOrder: mockOrder }),
}));

jest.mock('./use-calculate-shipping-line-tax-and-totals', () => ({
	useCalculateShippingLineTaxAndTotals: () => ({
		calculateShippingLineTaxesAndTotals: mockCalculateShippingLineTaxesAndTotals,
	}),
}));

jest.mock('./use-shipping-line-data', () => ({
	useShippingLineData: () => ({ getShippingLineData: mockGetShippingLineData }),
}));

describe('useUpdateShippingLine', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockShippingLines = [];
		mockGetShippingLineData.mockReturnValue({
			amount: 2,
			prices_include_tax: false,
			tax_status: 'taxable',
			tax_class: '',
		});
		mockCalculateShippingLineTaxesAndTotals.mockImplementation((line) => ({
			...line,
			total: '3',
		}));
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
			document: expect.objectContaining({ id: 17 }),
			data: { shipping_lines: [expect.objectContaining({ total: '3' })] },
		});
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
