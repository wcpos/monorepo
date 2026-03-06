import { buildReceiptData } from './build-receipt-data';

const mockOrder = {
	id: 123,
	number: '1234',
	status: 'completed',
	currency: 'USD',
	date_created: '2026-03-06T10:00:00',
	total: '25.00',
	total_tax: '2.50',
	discount_total: '5.00',
	shipping_total: '0.00',
	billing: {
		first_name: 'John',
		last_name: 'Doe',
		email: 'john@example.com',
		phone: '555-1234',
		address_1: '123 Main St',
		address_2: '',
		city: 'Springfield',
		state: 'IL',
		postcode: '62701',
		country: 'US',
		company: '',
	},
	shipping: {
		first_name: 'John',
		last_name: 'Doe',
		address_1: '123 Main St',
		address_2: '',
		city: 'Springfield',
		state: 'IL',
		postcode: '62701',
		country: 'US',
		company: '',
		phone: '',
	},
	payment_method: 'pos_cash',
	payment_method_title: 'Cash',
	transaction_id: 'txn_001',
	line_items: [
		{
			id: 1,
			name: 'Widget',
			quantity: 2,
			price: 12.5,
			total: '20.00',
			total_tax: '2.00',
			subtotal: '25.00',
			subtotal_tax: '2.50',
			sku: 'WDG-001',
		},
	],
};

const mockStore = {
	name: 'My POS Store',
	store_address: '456 Commerce Ave',
	store_city: 'Springfield',
	store_state: 'IL',
	store_postcode: '62701',
	store_country: 'US',
	phone: '555-9876',
	email: 'store@example.com',
};

describe('buildReceiptData', () => {
	it('maps meta section from order', () => {
		const result = buildReceiptData(mockOrder, mockStore);
		expect(result.meta.order_number).toBe('1234');
		expect(result.meta.currency).toBe('USD');
		expect(result.meta.status).toBe('completed');
		expect(result.meta.order_date).toBe('2026-03-06T10:00:00');
	});

	it('maps store section from store document', () => {
		const result = buildReceiptData(mockOrder, mockStore);
		expect(result.store.name).toBe('My POS Store');
		expect(result.store.phone).toBe('555-9876');
		expect(result.store.email).toBe('store@example.com');
		expect(result.store.address).toContain('456 Commerce Ave');
	});

	it('maps customer section from billing', () => {
		const result = buildReceiptData(mockOrder, mockStore);
		expect(result.customer.name).toBe('John Doe');
		expect(result.customer.email).toBe('john@example.com');
		expect(result.customer.phone).toBe('555-1234');
	});

	it('maps line items', () => {
		const result = buildReceiptData(mockOrder, mockStore);
		expect(result.lines).toHaveLength(1);
		expect(result.lines[0].name).toBe('Widget');
		expect(result.lines[0].quantity).toBe(2);
		expect(result.lines[0].sku).toBe('WDG-001');
		expect(result.lines[0].total).toBe('20.00');
	});

	it('maps totals', () => {
		const result = buildReceiptData(mockOrder, mockStore);
		expect(result.totals.grand_total_incl).toBe('25.00');
		expect(result.totals.tax_total).toBe('2.50');
		expect(result.totals.discount_total).toBe('5.00');
	});

	it('maps payments', () => {
		const result = buildReceiptData(mockOrder, mockStore);
		expect(result.payments).toHaveLength(1);
		expect(result.payments[0].method).toBe('Cash');
		expect(result.payments[0].amount).toBe('25.00');
		expect(result.payments[0].transaction_id).toBe('txn_001');
	});

	it('handles missing billing gracefully', () => {
		const orderNoBilling = { ...mockOrder, billing: undefined };
		const result = buildReceiptData(orderNoBilling, mockStore);
		expect(result.customer.name).toBe('');
		expect(result.customer.email).toBe('');
	});

	it('handles empty line_items', () => {
		const orderNoLines = { ...mockOrder, line_items: [] };
		const result = buildReceiptData(orderNoLines, mockStore);
		expect(result.lines).toHaveLength(0);
		expect(result.totals.subtotal).toBe('0.00');
	});
});
