import { orderChangedSinceRefusal, refusedWireOf } from './refused-wire';

const order = {
	status: 'pos-open',
	customer_id: 7,
	billing: { first_name: 'Ada' },
	line_items: [{ product_id: 1, quantity: 2, subtotal: '20.00', total: '20.00' }],
	total: '20.00',
	discount_total: '0.00',
	tax_lines: [{ rate_id: 1, tax_total: '2.00' }],
	payment_method: 'pos_cash',
	date_paid: null,
	set_paid: false,
	meta_data: [{ key: '_pos_user', value: '1' }],
};

it('keeps what the till asserts and drops what the store authors or owns', () => {
	const wire = refusedWireOf(order);
	expect(wire).toEqual({
		customer_id: 7,
		billing: { first_name: 'Ada' },
		line_items: order.line_items,
	});
	expect(refusedWireOf(null)).toEqual({});
});

it('reads a change only in what the till would send again', () => {
	const refused = refusedWireOf(order);
	expect(
		orderChangedSinceRefusal(
			{ ...order, total: '99.00', status: 'pending', meta_data: [{ key: 'x', value: 'y' }] },
			refused
		)
	).toBe(false);
	expect(
		orderChangedSinceRefusal(
			{ ...order, line_items: [{ ...order.line_items[0], quantity: 3 }] },
			refused
		)
	).toBe(true);
	expect(orderChangedSinceRefusal(order, null)).toBe(true);
});
