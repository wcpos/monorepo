import { returnToTill, tillHref } from './till-route';

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
	const router = { replace: jest.fn(), dismissTo: jest.fn() };
	returnToTill(router, true, tab);
	expect(router.dismissTo).toHaveBeenCalledTimes(1);
	expect(router.dismissTo).toHaveBeenCalledWith(href);
	expect(router.replace).not.toHaveBeenCalled();
});

it.each(['products', 'cart'] as const)('replaces with the wide cart for %s', (tab) => {
	const router = { replace: jest.fn(), dismissTo: jest.fn() };
	returnToTill(router, false, tab);
	expect(router.replace).toHaveBeenCalledTimes(1);
	expect(router.replace).toHaveBeenCalledWith({ pathname: '/cart' });
	expect(router.dismissTo).not.toHaveBeenCalled();
});
