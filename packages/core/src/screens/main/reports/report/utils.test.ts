import type { OrderDocument } from '@wcpos/database';

import { calculateTotals } from './utils';

describe('calculateTotals', () => {
	const mockOrders = [
		{
			total: '100',
			total_tax: '10',
			discount_total: '5',
			payment_method: 'credit_card',
			payment_method_title: 'Credit Card',
			needs_payment: false,
			line_items: [{ quantity: 2 }, { quantity: 3 }],
			tax_lines: [
				{ rate_id: 1, label: 'VAT', tax_total: '5' },
				{ rate_id: 2, label: 'Service Tax', tax_total: '5' },
			],
			shipping_lines: [
				{ method_id: 'flat_rate', method_title: 'Flat Rate', total: '15', total_tax: '1.5' },
			],
			meta_data: [
				{ key: '_pos_user', value: 'cashier_1' },
				{ key: '_pos_store', value: 'store_1' },
			],
		},
		{
			total: '200',
			total_tax: '20',
			discount_total: '10',
			payment_method: '',
			payment_method_title: '',
			needs_payment: true,
			line_items: [{ quantity: 1 }, { quantity: 1 }],
			tax_lines: [{ rate_id: 1, label: 'VAT', tax_total: '10' }],
			shipping_lines: [
				{ method_id: 'express', method_title: 'Express Shipping', total: '25', total_tax: '2.5' },
			],
			meta_data: [
				{ key: '_pos_user', value: 'cashier_2' },
				{ key: '_pos_store', value: 'store_2' },
			],
		},
		{
			total: '150',
			total_tax: '15',
			discount_total: '0',
			payment_method: '',
			payment_method_title: '',
			needs_payment: false,
			line_items: [{ quantity: 4 }],
			tax_lines: [{ rate_id: 2, label: 'Service Tax', tax_total: '5' }],
			shipping_lines: [
				{ method_id: 'flat_rate', method_title: 'Flat Rate', total: '10', total_tax: '1' },
			],
			meta_data: [
				{ key: '_pos_user', value: 'cashier_1' },
				{ key: '_pos_store', value: 'store_1' },
			],
		},
	] as OrderDocument[];

	it('calculates the total correctly', () => {
		const result = calculateTotals(mockOrders);
		expect(result.total).toBe(450); // 100 + 200 + 150
	});

	it('calculates the discount total correctly', () => {
		const result = calculateTotals(mockOrders);
		expect(result.discountTotal).toBe(15); // 5 + 10 + 0
	});

	it('calculates the total tax correctly', () => {
		const result = calculateTotals(mockOrders);
		expect(result.totalTax).toBe(45); // 10 + 20 + 15
	});

	it('calculates the total items sold correctly', () => {
		const result = calculateTotals(mockOrders);
		expect(result.totalItemsSold).toBe(11); // 2+3+1+1+4
	});

	it('categorizes unpaid and unknown payment methods correctly', () => {
		const result = calculateTotals(mockOrders);
		expect(result.paymentMethodsArray).toContainEqual({
			payment_method: 'credit_card',
			payment_method_title: 'Credit Card',
			total: 110, // 100 + 10
		});
		expect(result.paymentMethodsArray).toContainEqual({
			payment_method: 'unpaid',
			payment_method_title: '',
			total: 220, // 200 + 20
		});
		expect(result.paymentMethodsArray).toContainEqual({
			payment_method: 'unknown',
			payment_method_title: '',
			total: 165, // 150 + 15
		});
	});

	it('calculates tax totals correctly', () => {
		const result = calculateTotals(mockOrders);
		expect(result.taxTotalsArray).toContainEqual({
			rate_id: 1,
			label: 'VAT',
			total: 15, // 5 + 10
		});
		expect(result.taxTotalsArray).toContainEqual({
			rate_id: 2,
			label: 'Service Tax',
			total: 10, // 5 + 5
		});
	});

	it('calculates shipping totals correctly', () => {
		const result = calculateTotals(mockOrders);
		expect(result.shippingTotalsArray).toContainEqual({
			method_id: 'flat_rate',
			total: 25, // 15 + 10
			total_tax: 2.5, // 1.5 + 1
		});
		expect(result.shippingTotalsArray).toContainEqual({
			method_id: 'express',
			total: 25,
			total_tax: 2.5,
		});
	});

	it('calculates cashier and store totals correctly', () => {
		const result = calculateTotals(mockOrders);
		expect(result.userStoreArray).toContainEqual({
			cashierId: 'cashier_1',
			storeId: 'store_1',
			totalOrders: 2,
			totalAmount: 250, // 100 + 150
		});
		expect(result.userStoreArray).toContainEqual({
			cashierId: 'cashier_2',
			storeId: 'store_2',
			totalOrders: 1,
			totalAmount: 200,
		});
	});
});
