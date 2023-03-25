import { renderHook, act } from '@testing-library/react-hooks';
import { useObservableState } from 'observable-hooks';

import useTaxCalculation from './use-tax-calculation';
import useLocalData from '../../../../contexts/local-data';
import useTaxRates from '../../contexts/tax-rates';

/**
 * Mock the useObservableState hook
 */
jest.mock('observable-hooks');
(useObservableState as jest.Mock).mockImplementation((_, initialValue) => initialValue);
jest.mock('../../../../contexts/local-data', () =>
	require('../../../../contexts/local-data/__mocks__/local-data.mock')
);
jest.mock('../../contexts/tax-rates', () =>
	require('../../contexts/tax-rates/__mocks__/tax-rates.mock')
);

describe('useTaxCalculation', () => {
	beforeEach(() => {
		// (useObservableState as jest.Mock).mockImplementation((_, initialValue) => initialValue);
		// (localData.default as jest.Mock).mockImplementation(() => ({
		// 	store: mockStore,
		// }));
	});

	describe('getDisplayValues', () => {
		test('getDisplayValues with prices_include_tax="no"', () => {
			// @ts-ignore
			useLocalData.mockReturnValueOnce({
				store: {
					calc_taxes: 'yes',
					prices_include_tax: 'no',
					tax_round_at_subtotal: true,
				},
			});

			const { result } = renderHook(() => useTaxCalculation());

			const { getDisplayValues } = result.current;

			// Test case 1
			const displayValues1 = getDisplayValues('100', '', 'incl');
			expect(displayValues1.displayPrice).toBe('120');
			expect(displayValues1.taxTotal).toBe('20');
			expect(displayValues1.taxDisplayShop).toBe('incl');

			// Test case 2
			const displayValues2 = getDisplayValues('100', '', 'excl');
			expect(displayValues2.displayPrice).toBe('100');
			expect(displayValues2.taxTotal).toBe('20');
			expect(displayValues2.taxDisplayShop).toBe('excl');
		});

		test('getDisplayValues with prices_include_tax="yes"', () => {
			// @ts-ignore
			useLocalData.mockReturnValueOnce({
				store: {
					calc_taxes: 'yes',
					prices_include_tax: 'yes',
					tax_round_at_subtotal: true,
				},
			});

			const { result } = renderHook(() => useTaxCalculation());

			const { getDisplayValues } = result.current;

			// Test case 1
			const displayValues1 = getDisplayValues('100', '', 'incl');
			expect(displayValues1.displayPrice).toBe('100');
			expect(displayValues1.taxTotal).toBe('16.6667');
			expect(displayValues1.taxDisplayShop).toBe('incl');

			// Test case 2
			const displayValues2 = getDisplayValues('100', '', 'excl');
			expect(displayValues2.displayPrice).toBe('83.3333');
			expect(displayValues2.taxTotal).toBe('16.6667');
			expect(displayValues2.taxDisplayShop).toBe('excl');
		});
	});

	test('calcLineItemTotals', () => {
		const { result } = renderHook(() => useTaxCalculation());

		const { calcLineItemTotals } = result.current;

		// Test case 1
		const lineItemTotals1 = calcLineItemTotals(2, '100', '', 'taxable');
		expect(lineItemTotals1.subtotal).toBe('200');
		expect(lineItemTotals1.subtotal_tax).toBe('40');
		expect(lineItemTotals1.total).toBe('200');
		expect(lineItemTotals1.total_tax).toBe('40');
		expect(lineItemTotals1.taxes).toHaveLength(1);
		expect(lineItemTotals1.taxes[0].total).toBe('40');

		// Test case 2
		const lineItemTotals2 = calcLineItemTotals(1, '50', '', 'none');
		expect(lineItemTotals2.subtotal).toBe('50');
		expect(lineItemTotals2.subtotal_tax).toBe('0');
		expect(lineItemTotals2.total).toBe('50');
		expect(lineItemTotals2.total_tax).toBe('0');
		expect(lineItemTotals2.taxes).toHaveLength(0);
	});

	describe('calcOrderTotals', () => {
		test('calcOrderTotals with tax', () => {
			// @ts-ignore
			useTaxRates.mockReturnValueOnce({
				data: [
					{
						id: '72',
						country: 'CA',
						rate: '5.0000',
						name: 'GST',
						priority: 1,
						compound: false,
						shipping: true,
						order: 1,
						class: 'standard',
					},
					{
						id: '17',
						country: 'CA',
						state: 'QC',
						rate: '8.5000',
						name: 'PST',
						priority: 2,
						compound: true,
						shipping: true,
						order: 2,
						class: 'standard',
					},
				],
			});
			const { result } = renderHook(() => useTaxCalculation());

			const { calcOrderTotals } = result.current;

			const cartItems = [
				{
					id: '1',
					subtotal: '100',
					subtotal_tax: '20',
					total: '100',
					total_tax: '20',
					taxes: [
						{ id: '72', total: '10', subtotal: '10' },
						{ id: '17', total: '10', subtotal: '10' },
					],
				},
				{
					id: '2',
					subtotal: '50',
					subtotal_tax: '10',
					total: '50',
					total_tax: '10',
					taxes: [
						{ id: '72', total: '5', subtotal: '5' },
						{ id: '17', total: '5', subtotal: '5' },
					],
				},
			];

			// TODO - do we need to honor the order?
			// @ts-ignore
			const orderTotals = calcOrderTotals(cartItems);
			expect(orderTotals.total).toBe('180');
			expect(orderTotals.total_tax).toBe('30');
			expect(orderTotals.tax_lines).toHaveLength(2);
			expect(orderTotals.tax_lines[0]).toEqual({
				rate_id: '17',
				label: 'PST',
				compound: true,
				tax_total: '15',
			});
			expect(orderTotals.tax_lines[1]).toEqual({
				rate_id: '72',
				label: 'GST',
				compound: false,
				tax_total: '15',
			});
		});

		test('calcOrderTotals with no tax', () => {
			const { result } = renderHook(() => useTaxCalculation());

			const { calcOrderTotals } = result.current;

			const cartItems = [
				{ id: '1', total: '100', total_tax: '0', taxes: [] },
				{
					id: '2',
					total: '50',
					total_tax: '0',
					taxes: [],
				},
			];

			// @ts-ignore
			const orderTotals = calcOrderTotals(cartItems);
			expect(orderTotals.total).toBe('150');
			expect(orderTotals.total_tax).toBe('0');
			expect(orderTotals.tax_lines).toHaveLength(0);
		});

		test('calcOrderTotals with no items', () => {
			const { result } = renderHook(() => useTaxCalculation());

			const { calcOrderTotals } = result.current;

			const cartItems = [];

			const orderTotals = calcOrderTotals(cartItems);
			expect(orderTotals.total).toBe('0');
			expect(orderTotals.total_tax).toBe('0');
			expect(orderTotals.tax_lines).toHaveLength(0);
		});

		test('calcOrderTotals with invalid input', () => {
			const { result } = renderHook(() => useTaxCalculation());

			const { calcOrderTotals } = result.current;

			// @ts-ignore
			const cartItems = [null, undefined, 0, 'test', {}, []];

			// @ts-ignore
			expect(() => calcOrderTotals(cartItems)).toThrow();
		});
	});
});
