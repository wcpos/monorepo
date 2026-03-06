/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';

import { useAddFee } from './use-add-fee';

const mockAddItemToOrder = jest.fn();

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: jest.fn(() => {
		const logger = {
			with: jest.fn(),
			info: jest.fn(),
			error: jest.fn(),
		};
		logger.with.mockReturnValue(logger);
		return logger;
	}),
}));

jest.mock('./use-add-item-to-order', () => ({
	useAddItemToOrder: () => ({
		addItemToOrder: mockAddItemToOrder,
	}),
}));

jest.mock('./use-calculate-fee-line-tax-and-totals', () => ({
	useCalculateFeeLineTaxAndTotals: () => ({
		calculateFeeLineTaxesAndTotals: jest.fn((line) => ({ ...line, total: '5.00' })),
	}),
}));

jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({
		currentOrder: {
			uuid: 'order-uuid',
			id: 42,
			number: '1001',
		},
	}),
}));

const logger = (getLogger as unknown as jest.Mock).mock.results[0].value as {
	with: jest.Mock;
	info: jest.Mock;
	error: jest.Mock;
};

describe('useAddFee', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('does not log a success or generic error when storage is degraded', async () => {
		mockAddItemToOrder.mockRejectedValue(
			Object.assign(new Error('storage unavailable'), { code: 'DB01005' })
		);

		const { result } = renderHook(() => useAddFee());

		await result.current.addFee({
			name: 'Handling',
			amount: '5.00',
			percent: false,
			prices_include_tax: false,
			tax_class: '',
			tax_status: 'none',
			meta_data: [],
		});

		expect(logger.info).not.toHaveBeenCalled();
		expect(logger.error).not.toHaveBeenCalled();
	});
});
