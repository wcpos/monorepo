/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';

import { useAddShipping } from './use-add-shipping';

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

jest.mock('./use-calculate-shipping-line-tax-and-totals', () => ({
	useCalculateShippingLineTaxAndTotals: () => ({
		calculateShippingLineTaxesAndTotals: jest.fn((line) => ({ ...line, total: '8.00' })),
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

describe('useAddShipping', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('does not log a success or generic error when storage is degraded', async () => {
		mockAddItemToOrder.mockRejectedValue(
			Object.assign(new Error('storage unavailable'), { code: 'DB01005' })
		);

		const { result } = renderHook(() => useAddShipping());

		await result.current.addShipping({
			method_title: 'Flat rate',
			method_id: 'flat_rate',
			amount: '8.00',
			prices_include_tax: false,
			tax_status: 'none',
			tax_class: '',
			meta_data: [],
		});

		expect(logger.info).not.toHaveBeenCalled();
		expect(logger.error).not.toHaveBeenCalled();
	});
});
