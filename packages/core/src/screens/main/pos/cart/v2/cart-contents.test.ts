import { cartContents } from './cart-contents';

it('lists products with their quantity, then fees, then shipping, decoded and trimmed', () => {
	expect(
		cartContents({
			line_items: [
				{ name: 'Blue T-shirt', quantity: 2 },
				{ name: 'Hoodie &amp; Cap ', quantity: '1' },
				{ name: '', quantity: 3 },
			],
			fee_lines: [{ name: 'Gift wrap' }, { name: null }],
			shipping_lines: [{ method_title: 'Flat rate' }],
		})
	).toEqual([
		{ kind: 'line', name: 'Blue T-shirt', quantity: 2 },
		{ kind: 'line', name: 'Hoodie & Cap', quantity: 1 },
		{ kind: 'fee', name: 'Gift wrap' },
		{ kind: 'shipping', method: 'Flat rate' },
	]);
});

it('an empty or absent cart has no entries', () => {
	expect(cartContents({})).toEqual([]);
	expect(cartContents({ line_items: [], fee_lines: null, shipping_lines: undefined })).toEqual([]);
});
