import { openTill, returnToTill } from './till-route';

describe('openTill', () => {
	it('navigates to an existing order', () => {
		const router = { navigate: jest.fn() };
		openTill(router, 'order-uuid');
		expect(router.navigate).toHaveBeenCalledTimes(1);
		expect(router.navigate).toHaveBeenCalledWith({
			pathname: '/cart/[...orderId]',
			params: { orderId: ['order-uuid'] },
		});
	});

	it('navigates to a new cart when no order is supplied', () => {
		const router = { navigate: jest.fn() };
		openTill(router);
		expect(router.navigate).toHaveBeenCalledTimes(1);
		expect(router.navigate).toHaveBeenCalledWith({ pathname: '/cart' });
	});
});

describe('returnToTill', () => {
	it('dismisses the checkout sheet when there is a screen beneath it', () => {
		const router = { canDismiss: () => true, dismiss: jest.fn(), replace: jest.fn() };

		returnToTill(router);

		expect(router.dismiss).toHaveBeenCalledTimes(1);
		expect(router.replace).not.toHaveBeenCalled();
	});

	it('replaces a deep-linked checkout sheet with the cart when it cannot dismiss', () => {
		const router = { canDismiss: () => false, dismiss: jest.fn(), replace: jest.fn() };

		returnToTill(router);

		expect(router.replace).toHaveBeenCalledTimes(1);
		expect(router.replace).toHaveBeenCalledWith({ pathname: '/cart' });
		expect(router.dismiss).not.toHaveBeenCalled();
	});
});
