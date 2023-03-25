import { renderHook, act } from '@testing-library/react-hooks';
import { useObservableState } from 'observable-hooks';

import useTaxCalculation from './use-tax-calculation';
import * as localData from '../../../../contexts/local-data';
import * as taxRates from '../../contexts/tax-rates';

/**
 * Mock the useLocalData hook
 */
jest.mock('../../../../contexts/local-data', () => {
	const originalModule = jest.requireActual('../../../../contexts/local-data');

	return {
		...originalModule,
		useLocalData: jest.fn(),
		LocalDataProvider: jest.fn(({ children }) => <>{children}</>),
	};
});

(localData.default as jest.Mock).mockImplementation(() => ({
	store: {
		calc_taxes: 'yes',
		prices_include_tax: 'yes',
		tax_round_at_subtotal: true,
	},
}));

/**
 * Mock the useRates hook
 */
jest.mock('../../contexts/tax-rates', () => {
	const originalModule = jest.requireActual('../../contexts/tax-rates');

	return {
		...originalModule,
		useTaxRates: jest.fn(),
		TaxRateProvider: jest.fn(({ children }) => <>{children}</>),
	};
});

(taxRates.default as jest.Mock).mockImplementation(() => ({
	data: [
		{
			id: 72,
			country: 'CA',
			rate: '5.0000',
			name: 'GST',
			priority: 1,
			compound: false,
			shipping: true,
			order: 1,
			class: '',
		},
		{
			id: 17,
			country: 'CA',
			state: 'QC',
			rate: '8.5000',
			name: 'PST',
			priority: 2,
			compound: true,
			shipping: true,
			order: 2,
			class: '',
		},
	],
}));

/**
 * Mock the useObservableState hook
 */
jest.mock('observable-hooks');
(useObservableState as jest.Mock).mockImplementation((_, initialValue) => initialValue);

describe('useTaxCalculation', () => {
	beforeEach(() => {
		// (useObservableState as jest.Mock).mockImplementation((_, initialValue) => initialValue);
		// (localData.default as jest.Mock).mockImplementation(() => ({
		// 	store: mockStore,
		// }));
	});

	test('getDisplayValues', () => {
		const { result } = renderHook(() => useTaxCalculation());

		const { getDisplayValues } = result.current;

		// Test case 1
		const displayValues1 = getDisplayValues('100', '', 'incl');
		expect(displayValues1.displayPrice).toBe(100);
		expect(displayValues1.taxTotal).toBe(20);
		expect(displayValues1.taxDisplayShop).toBe('incl');

		// Test case 2
		const displayValues2 = getDisplayValues('100', '', 'excl');
		expect(displayValues2.displayPrice).toBe(80);
		expect(displayValues2.taxTotal).toBe(20);
		expect(displayValues2.taxDisplayShop).toBe('excl');
	});

	test('calcLineItemTotals', () => {
		const { result } = renderHook(() => useTaxCalculation());

		const { calcLineItemTotals } = result.current;

		// Test case 1
		const lineItemTotals1 = calcLineItemTotals(2, 100, '', 'taxable');
		expect(lineItemTotals1.subtotal).toBe('200');
		expect(lineItemTotals1.subtotal_tax).toBe('40');
		expect(lineItemTotals1.total).toBe('200');
		expect(lineItemTotals1.total_tax).toBe('40');
		expect(lineItemTotals1.taxes).toHaveLength(2);

		// Test case 2
		const lineItemTotals2 = calcLineItemTotals(1, 50, '', 'none');
		expect(lineItemTotals2.subtotal).toBe('50');
		expect(lineItemTotals2.subtotal_tax).toBe('0');
		expect(lineItemTotals2.total).toBe('50');
		expect(lineItemTotals2.total_tax).toBe('0');
		expect(lineItemTotals2.taxes).toHaveLength(0);
	});

	test('calcOrderTotals', () => {
		const { result } = renderHook(() => useTaxCalculation());

		const { calcOrderTotals } = result.current;

		const cartItems = [
			{
				id: '1',
				total: '100',
				total_tax: '20',
				taxes: [
					{ id: '72', total: '10' },
					{ id: '17', total: '10' },
				],
			},
			{
				id: '2',
				total: '50',
				total_tax: '10',
				taxes: [
					{ id: '72', total: '5' },
					{ id: '17', total: '5' },
				],
			},
		];

		/* @ts-ignore */
		const orderTotals = calcOrderTotals(cartItems);
		expect(orderTotals.total).toBe('180');
		expect(orderTotals.total_tax).toBe('30');
		expect(orderTotals.tax_lines).toHaveLength(2);
		expect(orderTotals.tax_lines[0]).toEqual({
			rate_id: '72',
			label: 'GST',
			compound: false,
			tax_total: '15',
		});
		expect(orderTotals.tax_lines[1]).toEqual({
			rate_id: '17',
			label: 'PST',
			compound: true,
			tax_total: '15',
		});
	});
});
