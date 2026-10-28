import { createTestT } from '../../../../../jest/translate';
import { tabWho } from './tab-who';

const t = createTestT();
it('uses the billing name before the cart contents', () => {
	expect(
		tabWho(
			{ billing: { first_name: 'Ada', last_name: 'Lovelace' }, line_items: [{ name: 'Hat' }] },
			t
		)
	).toBe('Ada Lovelace');
	expect(tabWho({ billing: { last_name: 'Lovelace' } }, t)).toBe('Lovelace');
});
it('distinguishes guests by one live entry, not its quantity', () => {
	expect(tabWho({ line_items: [{ name: 'Tea &amp; cake', quantity: 3 }] }, t)).toBe(
		'Guest · Tea & cake'
	);
	expect(tabWho({ fee_lines: [{ name: 'Gift wrap' }] }, t)).toBe('Guest · Gift wrap');
	expect(tabWho({ shipping_lines: [{ method_title: 'Express' }] }, t)).toBe(
		'Guest · Express shipping'
	);
});
it('counts multiple live entries, including fees and shipping', () => {
	expect(tabWho({ line_items: [{ name: 'Hat' }], fee_lines: [{ name: 'Wrap' }] }, t)).toBe(
		'Guest · 2 items'
	);
});
it('calls an empty or tombstoned cart Guest', () => {
	expect(tabWho({}, t)).toBe('Guest');
	expect(
		tabWho(
			{
				line_items: [
					{ product_id: null, name: 'Hat' },
					{ name: 'Tea', quantity: 0 },
				],
			},
			t
		)
	).toBe('Guest');
});
