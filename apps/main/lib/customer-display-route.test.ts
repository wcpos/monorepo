import { getCustomerDisplayRouteState } from './customer-display-route';

jest.resetModules();

describe('getCustomerDisplayRouteState', () => {
	it('maps POS, checkout, receipt, and inactive drawer routes', () => {
		expect(getCustomerDisplayRouteState(['(app)', '(drawer)', '(pos)', '(tabs)', 'index'])).toEqual(
			{ enabled: true, status: 'cart' }
		);
		expect(
			getCustomerDisplayRouteState([
				'(app)',
				'(drawer)',
				'(pos)',
				'(modals)',
				'cart',
				'[orderId]',
				'checkout',
			])
		).toEqual({ enabled: true, status: 'awaiting-payment' });
		expect(
			getCustomerDisplayRouteState([
				'(app)',
				'(drawer)',
				'(pos)',
				'(modals)',
				'cart',
				'receipt',
				'[orderId]',
			])
		).toEqual({ enabled: false, status: 'cart' });
		expect(getCustomerDisplayRouteState(['(app)', '(drawer)', 'products', 'checkout'])).toEqual({
			enabled: false,
			status: 'awaiting-payment',
		});
	});
});
