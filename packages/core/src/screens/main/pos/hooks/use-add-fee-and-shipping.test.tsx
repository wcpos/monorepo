/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';

import { useAddFee } from './use-add-fee';
import { useAddShipping } from './use-add-shipping';

const mockAddItemToOrder = jest.fn();

jest.mock('./use-add-item-to-order', () => ({
	useAddItemToOrder: () => ({ addItemToOrder: mockAddItemToOrder }),
}));
jest.mock('./use-calculate-fee-line-tax-and-totals', () => ({
	useCalculateFeeLineTaxAndTotals: () => ({
		calculateFeeLineTaxesAndTotals: (line: object) => ({ ...line, total: '5' }),
	}),
}));
jest.mock('./use-calculate-shipping-line-tax-and-totals', () => ({
	useCalculateShippingLineTaxAndTotals: () => ({
		calculateShippingLineTaxesAndTotals: (line: object) => ({ ...line, total: '5' }),
	}),
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../contexts/current-order', () => ({
	useCurrentOrder: () => ({
		currentOrder: { uuid: 'order-uuid', id: 7, number: '7' },
	}),
}));

describe('cart fee and shipping add failure reporting', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockAddItemToOrder.mockResolvedValue(undefined);
	});

	it('does not report an existing-order fee write failure a second time', async () => {
		const { result } = renderHook(() => useAddFee());

		await result.current.addFee({
			name: 'Handling',
			amount: '5',
			percent: false,
			prices_include_tax: false,
			tax_class: '',
			tax_status: 'none',
			meta_data: [],
		});

		expect(getLogger([]).error).not.toHaveBeenCalled();
		expect(getLogger([]).info).not.toHaveBeenCalled();
	});

	it('does not report an existing-order shipping write failure a second time', async () => {
		const { result } = renderHook(() => useAddShipping());

		await result.current.addShipping({
			method_title: 'Pickup',
			method_id: 'local_pickup',
			amount: '5',
			prices_include_tax: false,
			tax_status: 'none',
			tax_class: '',
		});

		expect(getLogger([]).error).not.toHaveBeenCalled();
		expect(getLogger([]).info).not.toHaveBeenCalled();
	});
});
