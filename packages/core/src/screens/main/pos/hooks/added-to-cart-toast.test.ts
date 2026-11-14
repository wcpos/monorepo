const mockToastShow = jest.fn();

jest.mock('@wcpos/components/toast', () => ({
	Toast: { show: (...args: unknown[]) => mockToastShow(...args) },
}));

type ToastConfig = {
	id: string;
	title: string;
	description?: unknown;
	onDismiss: () => void;
	onAutoClose: () => void;
};

const t = ((key: string, options?: Record<string, unknown>) =>
	`${key} ${JSON.stringify(options)}`) as unknown as Parameters<
	typeof import('./added-to-cart-toast').showAddedToCartToast
>[0];

const shown = (call: number) => mockToastShow.mock.calls[call][0] as ToastConfig;

describe('showAddedToCartToast', () => {
	let showAddedToCartToast: typeof import('./added-to-cart-toast').showAddedToCartToast;
	let ADDED_TO_CART_DURATION: number;

	beforeEach(() => {
		jest.useFakeTimers({ now: 1_000_000 });
		mockToastShow.mockReset();
		// The count is module state; each test starts from a fresh module.
		jest.isolateModules(() => {
			({ showAddedToCartToast, ADDED_TO_CART_DURATION } = require('./added-to-cart-toast'));
		});
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('shows two rapid adds as one toast under the same id', () => {
		showAddedToCartToast(t, 'Beanie');
		showAddedToCartToast(t, 'Cap');

		expect(mockToastShow).toHaveBeenCalledTimes(2);
		expect(shown(0).id).toBe('pos-added-to-cart');
		expect(shown(1).id).toBe(shown(0).id);
	});

	it('names the first add, and counts later adds without a name', () => {
		showAddedToCartToast(t, 'Beanie');
		showAddedToCartToast(t, 'Cap');
		showAddedToCartToast(t, 'Hoodie');

		expect(shown(0).title).toBe('common.added_to_cart {"name":"Beanie"}');
		expect(shown(1).title).toBe('common.added_to_cart_count {"count":2}');
		expect(shown(2).title).toBe('common.added_to_cart_count {"count":3}');
		// Compact: a title only, never a second line.
		expect(shown(2).description).toBeUndefined();
	});

	it('counts the same product added three times as three items', () => {
		showAddedToCartToast(t, 'Beanie');
		showAddedToCartToast(t, 'Beanie');
		showAddedToCartToast(t, 'Beanie');

		expect(shown(0).title).toBe('common.added_to_cart {"name":"Beanie"}');
		expect(shown(2).title).toBe('common.added_to_cart_count {"count":3}');
	});

	it('starts the count again after the toast auto-closes', () => {
		showAddedToCartToast(t, 'Beanie');
		showAddedToCartToast(t, 'Cap');
		shown(1).onAutoClose();
		showAddedToCartToast(t, 'Hoodie');

		expect(shown(2).title).toBe('common.added_to_cart {"name":"Hoodie"}');
	});

	it('starts the count again after the toast is dismissed', () => {
		showAddedToCartToast(t, 'Beanie');
		showAddedToCartToast(t, 'Cap');
		shown(1).onDismiss();
		showAddedToCartToast(t, 'Hoodie');

		expect(shown(2).title).toBe('common.added_to_cart {"name":"Hoodie"}');
	});

	it('starts the count again once the duration has passed with no close callback', () => {
		showAddedToCartToast(t, 'Beanie');
		jest.setSystemTime(Date.now() + ADDED_TO_CART_DURATION - 1);
		showAddedToCartToast(t, 'Cap');
		jest.setSystemTime(Date.now() + ADDED_TO_CART_DURATION + 1);
		showAddedToCartToast(t, 'Hoodie');

		expect(shown(1).title).toBe('common.added_to_cart_count {"count":2}');
		expect(shown(2).title).toBe('common.added_to_cart {"name":"Hoodie"}');
	});
});
