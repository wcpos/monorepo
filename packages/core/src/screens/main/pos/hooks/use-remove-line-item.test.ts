/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useRemoveLineItem } from './use-remove-line-item';

const mockLocalPatch = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerSuccess = jest.fn();

let mockLines: object[] = [];
const mockOrder = {
	id: 17,
	getLatest: () => ({ id: 17, line_items: mockLines }),
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

describe('useRemoveLineItem', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockLocalPatch.mockResolvedValue(true);
		mockLines = [];
	});

	it('patches a matching line and logs success with an undo action', async () => {
		mockLines = [
			{
				id: 11,
				name: 'Coffee',
				product_id: 82,
				meta_data: [{ key: '_woocommerce_pos_uuid', value: 'line-1' }],
			},
		];
		const { result } = renderHook(() => useRemoveLineItem());

		await act(async () => {
			await result.current.removeLineItem('line-1', 'line_items');
		});

		expect(mockLocalPatch).toHaveBeenCalledWith({
			document: expect.objectContaining({ id: 17 }),
			data: {
				line_items: [expect.objectContaining({ id: 11, product_id: null })],
			},
		});
		expect(mockLoggerSuccess).toHaveBeenCalledWith(
			'pos.removed_from_cart',
			expect.objectContaining({
				toast: expect.objectContaining({
					action: expect.objectContaining({ label: 'common.undo', onClick: expect.any(Function) }),
				}),
			})
		);
		expect(mockLoggerWarn).not.toHaveBeenCalled();
	});

	it('warns when the line is no longer in the current order', async () => {
		const { result } = renderHook(() => useRemoveLineItem());

		await act(async () => {
			await result.current.removeLineItem('missing', 'line_items');
		});

		expect(mockLoggerWarn).toHaveBeenCalledTimes(1);
		expect(mockLoggerWarn).toHaveBeenCalledWith(
			'Remove tapped for a line that is no longer in the cart',
			{
				showToast: true,
				toast: { title: 'pos_cart.remove_line_not_found' },
				context: { uuid: 'missing', itemType: 'line_items', orderId: 17 },
			}
		);
	});
});
