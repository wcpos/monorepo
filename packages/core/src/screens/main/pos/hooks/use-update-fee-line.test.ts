/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useUpdateFeeLine } from './use-update-fee-line';

const mockLocalPatch = jest.fn();
const mockCalculateFeeLineTaxesAndTotals = jest.fn();
const mockGetFeeLineData = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerSuccess = jest.fn();

let mockFeeLines: object[] = [];
const mockOrder = {
	uuid: 'order-uuid',
	payload: { id: 17 },
	getLatest: () => ({
		payload: { id: 17 },
		toMutableJSON: () => ({ payload: { fee_lines: mockFeeLines } }),
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

jest.mock('./use-calculate-fee-line-tax-and-totals', () => ({
	useCalculateFeeLineTaxAndTotals: () => ({
		calculateFeeLineTaxesAndTotals: mockCalculateFeeLineTaxesAndTotals,
	}),
}));

jest.mock('./use-fee-line-data', () => ({
	useFeeLineData: () => ({ getFeeLineData: mockGetFeeLineData }),
}));

describe('useUpdateFeeLine', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockFeeLines = [];
		mockGetFeeLineData.mockReturnValue({
			amount: '2',
			percent: false,
			prices_include_tax: false,
			percent_of_cart_total_with_tax: false,
		});
		mockCalculateFeeLineTaxesAndTotals.mockImplementation((line) => ({
			...line,
			total: '3',
		}));
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
			data: { fee_lines: [expect.objectContaining({ total: '3' })] },
		});
		expect(mockLoggerWarn).not.toHaveBeenCalled();
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
