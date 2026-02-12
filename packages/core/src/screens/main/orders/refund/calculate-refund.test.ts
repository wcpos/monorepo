import { calculateLineItemRefund, calculateRefundTotal } from './calculate-refund';

describe('calculateLineItemRefund', () => {
	it('calculates proportional refund for a single unit', () => {
		const result = calculateLineItemRefund({
			quantity: 3,
			total: '30.00',
			totalTax: '6.00',
			taxes: [{ id: 1, total: '6.00' }],
			refundQty: 1,
		});

		expect(result.refund_total).toBe('10.00');
		expect(result.refund_tax).toEqual([{ id: 1, refund_total: '2.00' }]);
	});

	it('calculates full refund when refundQty equals quantity', () => {
		const result = calculateLineItemRefund({
			quantity: 2,
			total: '25.50',
			totalTax: '5.10',
			taxes: [{ id: 1, total: '5.10' }],
			refundQty: 2,
		});

		expect(result.refund_total).toBe('25.50');
		expect(result.refund_tax).toEqual([{ id: 1, refund_total: '5.10' }]);
	});

	it('returns zeros when refundQty is 0', () => {
		const result = calculateLineItemRefund({
			quantity: 3,
			total: '30.00',
			totalTax: '6.00',
			taxes: [{ id: 1, total: '6.00' }],
			refundQty: 0,
		});

		expect(result.refund_total).toBe('0.00');
		expect(result.refund_tax).toEqual([{ id: 1, refund_total: '0.00' }]);
	});

	it('handles multiple tax rates', () => {
		const result = calculateLineItemRefund({
			quantity: 2,
			total: '20.00',
			totalTax: '4.00',
			taxes: [
				{ id: 1, total: '3.00' },
				{ id: 2, total: '1.00' },
			],
			refundQty: 1,
		});

		expect(result.refund_total).toBe('10.00');
		expect(result.refund_tax).toEqual([
			{ id: 1, refund_total: '1.50' },
			{ id: 2, refund_total: '0.50' },
		]);
	});

	it('handles zero tax', () => {
		const result = calculateLineItemRefund({
			quantity: 2,
			total: '20.00',
			totalTax: '0.00',
			taxes: [],
			refundQty: 1,
		});

		expect(result.refund_total).toBe('10.00');
		expect(result.refund_tax).toEqual([]);
	});
});

describe('calculateRefundTotal', () => {
	it('sums line item refunds and custom amount', () => {
		const result = calculateRefundTotal({
			lineItemRefunds: [
				{ refund_total: '10.00', refund_tax: [{ id: 1, refund_total: '2.00' }] },
				{ refund_total: '5.00', refund_tax: [{ id: 1, refund_total: '1.00' }] },
			],
			customAmount: '3.00',
		});

		expect(result).toBe('21.00');
	});

	it('returns just line item totals with taxes when no custom amount', () => {
		const result = calculateRefundTotal({
			lineItemRefunds: [
				{ refund_total: '10.00', refund_tax: [{ id: 1, refund_total: '2.00' }] },
			],
			customAmount: '',
		});

		expect(result).toBe('12.00');
	});

	it('returns just custom amount when no line items', () => {
		const result = calculateRefundTotal({
			lineItemRefunds: [],
			customAmount: '7.50',
		});

		expect(result).toBe('7.50');
	});

	it('returns 0.00 when nothing selected', () => {
		const result = calculateRefundTotal({
			lineItemRefunds: [],
			customAmount: '',
		});

		expect(result).toBe('0.00');
	});
});
