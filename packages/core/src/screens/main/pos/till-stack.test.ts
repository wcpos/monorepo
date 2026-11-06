import { settleTillStack, tillStackScreenListeners } from './till-stack';

const index = { key: 'index', name: 'index' };
const columns = { key: 'columns', name: '(columns)/index' };
const cart = {
	key: 'cart',
	name: '(columns)/cart/[...orderId]',
	params: { orderId: ['o2'] },
	state: { routes: [{ name: 'child' }] },
};
const oldCart = { ...cart, key: 'old-cart', params: { orderId: ['o1'] } };
const checkout = { key: 'checkout', name: '(modals)/cart/[orderId]/checkout' };
const receipt = { key: 'receipt', name: '(modals)/cart/receipt/[orderId]' };
const settledCases = [[], [index], [cart], [columns, checkout], [index, checkout], [cart, receipt]];

describe('settleTillStack', () => {
	it.each(settledCases.map((routes) => [routes]))(
		'leaves a settled stack unchanged: %j',
		(routes) => {
			expect(settleTillStack(routes)).toBeNull();
		}
	);

	it.each([
		{ routes: [columns, cart], expected: [cart] },
		{ routes: [oldCart, checkout, cart], expected: [cart] },
		{ routes: [index, cart], expected: [cart] },
		{ routes: [columns, cart, checkout], expected: [cart, checkout] },
	])('keeps the newest till and its sheets: $routes', ({ routes, expected }) => {
		const settled = settleTillStack(routes);
		expect(settled).toEqual(expected);
		// The survivor's key and nested state must not be rebuilt during settlement.
		expect(settled?.[0]).toBe(cart);
	});
});

describe('tillStackScreenListeners', () => {
	const stateEvent = (routes: { key: string; name: string }[]) => ({
		type: 'state' as const,
		data: {
			state: {
				key: 'pos',
				routeKeySeq: 3,
				index: routes.length - 1,
				routeNames: [],
				routes,
				stale: false as const,
				type: 'stack',
			},
		},
	});

	it('resets to the same newest till and sheet objects', () => {
		const navigation = { reset: jest.fn() };
		const event = stateEvent([columns, cart, checkout]);
		tillStackScreenListeners({ navigation }).state(event);
		expect(navigation.reset).toHaveBeenCalledTimes(1);
		expect(navigation.reset).toHaveBeenCalledWith({
			...event.data.state,
			index: 1,
			routes: [cart, checkout],
		});
		expect(navigation.reset.mock.calls[0][0].routes[0]).toBe(cart);
		expect(navigation.reset.mock.calls[0][0].routes[1]).toBe(checkout);
	});

	it.each(settledCases.map((routes) => [routes]))(
		'does not reset a settled stack: %j',
		(routes) => {
			const navigation = { reset: jest.fn() };
			tillStackScreenListeners({ navigation }).state(stateEvent(routes));
			expect(navigation.reset).not.toHaveBeenCalled();
		}
	);
});
