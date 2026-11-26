import { refusesTaxLocationMove } from './tax-location-lock';

import type { OrderPayload } from './cart-config-for-order';

const base = { country: 'US', state: 'WA', city: 'Seattle', postcode: '98101' };
const other = { ...base, country: 'GB' };
const stamp = (value: string) => [{ key: '_woocommerce_pos_tax_based_on', value }];

it.each<[string, string, OrderPayload, OrderPayload, boolean]>([
	[
		'A4 shipping postcode moves',
		'shipping',
		{ shipping: base },
		{ shipping: { ...base, postcode: '98102' } },
		true,
	],
	[
		'A5 billing fallback moves',
		'shipping',
		{ billing: base },
		{ billing: { ...base, city: 'Tacoma' } },
		true,
	],
	[
		'A6 shipping matches billing fallback',
		'shipping',
		{ billing: base },
		{ shipping: base },
		false,
	],
	['A7 billing matches base fallback', 'billing', {}, { billing: base }, false],
	['A8 billing differs from base fallback', 'billing', {}, { billing: other }, true],
	['A9 base never moves', 'base', {}, { billing: other, shipping: other }, false],
	[
		'F2a undefined billing keeps country',
		'billing',
		{ billing: other },
		{ billing: undefined },
		false,
	],
	[
		'F2b undefined shipping keeps country',
		'shipping',
		{ shipping: other },
		{ shipping: undefined },
		false,
	],
	[
		'null and empty city match',
		'billing',
		{ billing: { ...base, city: null! } },
		{ billing: { ...base, city: '' } },
		false,
	],
	[
		'a replaced basis can move the location',
		'base',
		{ billing: other },
		{ meta_data: stamp('billing') },
		true,
	],
])('%s', (_, basis, before, changes, refused) => {
	expect(
		refusesTaxLocationMove(
			{ ...before, refunds: [{ id: 7 }], meta_data: stamp(basis) },
			changes,
			base,
			'base'
		)
	).toBe(refused);
});
