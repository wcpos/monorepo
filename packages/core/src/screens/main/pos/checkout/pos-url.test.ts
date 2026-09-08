import { posBasePath, posPathFor, type PosUrlState, readCheckoutSeed } from './pos-url';

it.each<[PosUrlState, string]>([
	[{ stage: 'cart' }, '/cart'],
	[{ stage: 'cart', orderId: 'u' }, '/cart/u'],
	[{ stage: 'checkout', orderId: 'u' }, '/cart/u/checkout'],
	[{ stage: 'checkout', orderId: 'u', methodId: 'cash' }, '/cart/u/checkout/cash'],
	[{ stage: 'checkout', orderId: 'u', receiptOrderId: 'r' }, '/cart/receipt/r'],
])('mirrors %j', (state, path) => expect(posPathFor(state)).toBe(path));

it.each<[string | string[] | undefined, ReturnType<typeof readCheckoutSeed>]>([
	['u', { orderId: 'u', checkout: false }],
	[['u'], { orderId: 'u', checkout: false }],
	[['u', 'checkout'], { orderId: 'u', checkout: true }],
	[['u', 'checkout', 'cash'], { orderId: 'u', checkout: true, methodId: 'cash' }],
	[['u', 'other', 'x'], { orderId: 'u', checkout: false }],
	[undefined, { checkout: false }],
])('reads %j', (param, seed) => expect(readCheckoutSeed(param)).toEqual(seed));

it('uses the homepage pathname without its trailing slash', () => {
	const host = globalThis as typeof globalThis & { initialProps?: { homepage?: string } };
	const previous = host.initialProps;
	try {
		host.initialProps = { homepage: 'https://example.com/pos/' };
		expect(posBasePath()).toBe('/pos');
		host.initialProps = undefined;
		expect(posBasePath()).toBe('');
	} finally {
		host.initialProps = previous;
	}
});
