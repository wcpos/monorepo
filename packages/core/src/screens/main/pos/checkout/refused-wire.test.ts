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

it('compares a sparse refusal (a refused cart edit) on the fields it carried', () => {
	// A cart edit enqueues only its changes; its dead letter has no billing or customer.
	const refused = refusedWireOf({ line_items: order.line_items });
	expect(orderChangedSinceRefusal(order, refused)).toBe(false);
	expect(
		orderChangedSinceRefusal(
			{ ...order, line_items: [{ ...order.line_items[0], quantity: 3 }] },
			refused
		)
	).toBe(true);
	// Nothing Pay could change was refused: the retry is a different write.
	expect(orderChangedSinceRefusal(order, {})).toBe(true);
});

it("a guest sale's empty billing email projects as the queue row did: absent", () => {
	// The enqueue seam drops `billing.email: ''`, so the refused row never carries it;
	// the resident still does. Both sides go through that seam, or an unchanged guest
	// cart would read as changed on every Pay press.
	const guest = { ...order, billing: { first_name: 'Ada', email: '' } };
	const refused = refusedWireOf({ ...guest, billing: { first_name: 'Ada' } });
	expect(refusedWireOf(guest).billing).toEqual({ first_name: 'Ada' });
	expect(orderChangedSinceRefusal(guest, refused)).toBe(false);
});
