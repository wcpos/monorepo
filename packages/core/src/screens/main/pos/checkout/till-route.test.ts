import { columnsCheckoutHref, handSheetToColumns, returnToTill, tillHref } from './till-route';

it.each([
	[true, 'products', '/(app)/(drawer)/(pos)/(tabs)'],
	[true, 'cart', '/(app)/(drawer)/(pos)/(tabs)/cart'],
	[false, 'products', '/cart'],
	[false, 'cart', '/cart'],
] as const)('tillHref(%s, %s) returns %s', (compact, tab, href) => {
	expect(tillHref(compact, tab)).toBe(href);
});

it.each([
	['products', '/(app)/(drawer)/(pos)/(tabs)'],
	['cart', '/(app)/(drawer)/(pos)/(tabs)/cart'],
] as const)('dismisses to the phone %s tab without replacing', (tab, href) => {
	const router = {
		replace: jest.fn(),
		dismissTo: jest.fn(),
		dismiss: jest.fn(),
		canDismiss: () => true,
	};
	returnToTill(router, true, tab);
	expect(router.dismissTo).toHaveBeenCalledTimes(1);
	expect(router.dismissTo).toHaveBeenCalledWith(href);
	expect(router.replace).not.toHaveBeenCalled();
	expect(router.dismiss).not.toHaveBeenCalled();
});

it.each(['products', 'cart'] as const)('dismisses to the wide till for %s', (tab) => {
	const router = {
		replace: jest.fn(),
		dismissTo: jest.fn(),
		dismiss: jest.fn(),
		canDismiss: () => true,
	};
	returnToTill(router, false, tab);
	expect(router.dismiss).toHaveBeenCalledTimes(1);
	expect(router.replace).not.toHaveBeenCalled();
	expect(router.dismissTo).not.toHaveBeenCalled();
});

it.each(['products', 'cart'] as const)('replaces a wide deep link with the cart for %s', (tab) => {
	const router = {
		replace: jest.fn(),
		dismissTo: jest.fn(),
		dismiss: jest.fn(),
		canDismiss: () => false,
	};
	returnToTill(router, false, tab);
	expect(router.replace).toHaveBeenCalledTimes(1);
	expect(router.replace).toHaveBeenCalledWith({ pathname: '/cart' });
	expect(router.dismissTo).not.toHaveBeenCalled();
	expect(router.dismiss).not.toHaveBeenCalled();
});

it('columnsCheckoutHref names the columns cart in checkout for the order', () => {
	expect(columnsCheckoutHref('o1')).toEqual({
		pathname: '/(app)/(drawer)/(pos)/(columns)/cart/[...orderId]',
		params: { orderId: ['o1', 'checkout'] },
	});
});

describe('handSheetToColumns', () => {
	it('pops a sheet with a till beneath without replacing', () => {
		const router = { replace: jest.fn(), dismiss: jest.fn(), canDismiss: () => true };
		handSheetToColumns(router, 'o1');
		expect(router.dismiss).toHaveBeenCalledTimes(1);
		expect(router.replace).not.toHaveBeenCalled();
	});

	it('replaces a deep link with nothing beneath with the columns checkout', () => {
		const router = { replace: jest.fn(), dismiss: jest.fn(), canDismiss: () => false };
		handSheetToColumns(router, 'o1');
		expect(router.replace).toHaveBeenCalledTimes(1);
		expect(router.replace).toHaveBeenCalledWith(columnsCheckoutHref('o1'));
		expect(router.dismiss).not.toHaveBeenCalled();
	});
});
