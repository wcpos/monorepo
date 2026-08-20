import { displayStockStatus } from './resolve-stock';

describe('displayStockStatus', () => {
	it.each([
		// Self-managed stock: the quantity is the truth, the payload flag is a
		// server echo that lags a local edit until the push acks.
		{
			label: 'derives instock from a positive quantity over a stale outofstock flag',
			input: { manage_stock: true, stock_quantity: 4, stock_status: 'outofstock' },
			expected: 'instock',
		},
		{
			label: 'derives outofstock from a non-positive quantity over a stale instock flag',
			input: {
				manage_stock: true,
				stock_quantity: -3,
				stock_status: 'instock',
				backorders: 'no',
			},
			expected: 'outofstock',
		},
		{
			label: 'derives onbackorder when backorders are allowed at zero stock',
			input: {
				manage_stock: true,
				stock_quantity: 0,
				stock_status: 'instock',
				backorders: 'notify',
			},
			expected: 'onbackorder',
		},
		// Not self-managed: the server's word passes through verbatim, custom
		// statuses included.
		{
			label: 'passes the flag through when stock is not managed',
			input: { manage_stock: false, stock_quantity: 4, stock_status: 'outofstock' },
			expected: 'outofstock',
		},
		{
			label: 'passes a custom status through untouched',
			input: { manage_stock: false, stock_status: 'lowstock' },
			expected: 'lowstock',
		},
		{
			label: 'passes a custom status through even when stock is self-managed',
			// A plugin-owned status is outside the vocabulary the quantity can
			// derive — clobbering it would be permanent, since the ack follows
			// this same branch (Codex P1 on #1380).
			input: { manage_stock: true, stock_quantity: 4, stock_status: 'lowstock' },
			expected: 'lowstock',
		},
		{
			label: 'passes the flag through for parent-managed variations',
			input: { manage_stock: 'parent' as const, stock_quantity: 0, stock_status: 'instock' },
			expected: 'instock',
		},
		{
			label: 'passes the flag through when managed stock has no numeric quantity',
			input: { manage_stock: true, stock_quantity: null, stock_status: 'onbackorder' },
			expected: 'onbackorder',
		},
	])('$label', ({ input, expected }) => {
		expect(displayStockStatus(input)).toBe(expected);
	});
});
