import * as React from 'react';
import { Text } from 'react-native';

import { Redirect, router, Slot, Stack, Tabs, useFocusEffect, useNavigation } from 'expo-router';
import { act, renderRouter } from 'expo-router/testing-library';

import {
	columnsCheckoutHref,
	leaveSheet,
	returnToTill,
	routeBeneath,
	tillCartHref,
} from '../../../packages/core/src/screens/main/pos/checkout/till-route';

// The checkout fixture records the route beneath it from its own navigation, read in a focus
// effect as CheckoutScreen does: during a pushed screen's first render the push is not committed.
let beneathCheckout: string | undefined;
function CheckoutProbe() {
	const navigation = useNavigation();
	useFocusEffect(
		React.useCallback(() => {
			beneathCheckout = routeBeneath(navigation.getState());
		}, [navigation])
	);
	return <Text testID="checkout-modal" />;
}

const checkoutRoutes = {
	'(app)/_layout': () => <Slot />,
	'(app)/(drawer)/_layout': () => <Slot />,
	'(app)/(drawer)/(pos)/_layout': () => <Stack />,
	// expo-router breaks the /cart tie by config order, which on disk is alphabetical.
	'(app)/(drawer)/(pos)/(columns)/index': () => <Text testID="columns-index" />,
	'(app)/(drawer)/(pos)/(columns)/cart/index': () => <Text testID="columns-cart" />,
	'(app)/(drawer)/(pos)/(columns)/cart/[...orderId]': () => <Text testID="columns-cart" />,
	'(app)/(drawer)/(pos)/(modals)/cart/[orderId]/checkout': CheckoutProbe,
	'(app)/(drawer)/(pos)/(tabs)/_layout': () => (
		<Tabs>
			<Tabs.Screen name="index" />
			<Tabs.Screen name="cart" />
		</Tabs>
	),
	'(app)/(drawer)/(pos)/(tabs)/index': () => <Text testID="tabs-products" />,
	'(app)/(drawer)/(pos)/(tabs)/cart/_layout': () => <Slot />,
	'(app)/(drawer)/(pos)/(tabs)/cart/index': () => <Text testID="tabs-cart" />,
	'(app)/(drawer)/(pos)/(tabs)/cart/[...orderId]': () => <Text testID="tabs-cart" />,
	'(app)/(drawer)/(pos)/index': () => <Redirect href="/(app)/(drawer)/(pos)/(tabs)" />,
};

const posStack = (view: Awaited<ReturnType<typeof renderRouter>>) =>
	view
		.getRouterState()
		?.routes.find((route) => route.name === '__root')
		?.state?.routes.find((route) => route.name === '(app)')
		?.state?.routes.find((route) => route.name === '(drawer)')
		?.state?.routes.find((route) => route.name === '(pos)')?.state;

async function renderDeepLinkCheckout(index = checkoutRoutes['(app)/(drawer)/(pos)/index']) {
	return renderRouter(
		{
			...checkoutRoutes,
			'(app)/(drawer)/(pos)/index': index,
			'(app)/(drawer)/(pos)/_layout': {
				default: () => <Stack />,
				unstable_settings: { anchor: 'index' },
			},
		},
		{ initialUrl: '/(app)/(drawer)/(pos)/(modals)/cart/o1/checkout' }
	);
}

async function renderCheckout(wide = false) {
	const view = await renderRouter(checkoutRoutes, {
		initialUrl: wide ? '/(app)/(drawer)/(pos)/(columns)/cart/o1' : '/',
	});
	if (wide) {
		await act(async () => router.navigate('/(app)/(drawer)/(pos)/(columns)/cart/o1'));
		expect(view.getSegments().slice(-3)).toEqual(['(columns)', 'cart', '[...orderId]']);
		expect(view.getPathname()).toBe('/cart/o1');
	} else {
		expect(view.getSegments()).toEqual(['(app)', '(drawer)', '(pos)', '(tabs)']);
		await act(async () => router.navigate('/(app)/(drawer)/(pos)/(tabs)/cart'));
	}
	await act(async () => {
		router.push({
			pathname: '/(app)/(drawer)/(pos)/(modals)/cart/[orderId]/checkout',
			params: { orderId: 'o1' },
		});
	});
	expect(view.getSegments()).toEqual([
		'(app)',
		'(drawer)',
		'(pos)',
		'(modals)',
		'cart',
		'[orderId]',
		'checkout',
	]);
	return { view };
}

describe('checkout returns to the phone till (#2363)', () => {
	it('control: replacing with /cart from checkout selects columns', async () => {
		const { view } = await renderCheckout();
		await act(async () => router.replace({ pathname: '/cart' }));
		expect(view.getSegments()).toEqual(['(app)', '(drawer)', '(pos)', '(columns)', 'cart']);
	});

	it('dismisses to the focused Products tab after a sale', async () => {
		const { view } = await renderCheckout();
		await act(async () => returnToTill(router, true, 'products'));
		// Segments identify the focused route even when the other tab stays mounted.
		expect(view.getSegments()).toEqual(['(app)', '(drawer)', '(pos)', '(tabs)']);
		expect(posStack(view)?.routes.map((route) => route.name)).toEqual(['(tabs)']);
		expect(posStack(view)?.routes[0].state?.index).toBe(0);
	});

	it('dismisses to the Cart tab when checkout is abandoned', async () => {
		const { view } = await renderCheckout();
		await act(async () => returnToTill(router, true, 'cart'));
		expect(view.getSegments()).toEqual(['(app)', '(drawer)', '(pos)', '(tabs)', 'cart']);
		expect(posStack(view)?.routes.map((route) => route.name)).toEqual(['(tabs)']);
	});

	it('keeps exactly one tabs route in the POS stack after two sales', async () => {
		const { view } = await renderCheckout();
		await act(async () => returnToTill(router, true, 'products'));
		await act(async () => {
			router.push({
				pathname: '/(app)/(drawer)/(pos)/(modals)/cart/[orderId]/checkout',
				params: { orderId: 'o2' },
			});
		});
		await act(async () => returnToTill(router, true, 'products'));
		expect(posStack(view)?.routes.map((route) => route.name)).toEqual(['(tabs)']);
	});
});

describe('checkout returns to the wide till', () => {
	it('control: replacing with /cart leaves two POS routes', async () => {
		const { view } = await renderCheckout(true);
		await act(async () => router.replace({ pathname: '/cart' }));
		expect(posStack(view)?.routes.map((route) => route.name)).toEqual([
			'(columns)/cart/[...orderId]',
			'(columns)/cart/index',
		]);
	});

	it('dismisses to the original wide till route', async () => {
		const { view } = await renderCheckout(true);
		const originalRoute = posStack(view)?.routes[0];
		await act(async () => returnToTill(router, false, 'products'));
		expect(posStack(view)?.routes).toEqual([originalRoute]);
		expect(view.getSegments().slice(-3)).toEqual(['(columns)', 'cart', '[...orderId]']);
		expect(view.getPathname()).toBe('/cart/o1');
	});

	it('keeps exactly one wide till route after two sales', async () => {
		const { view } = await renderCheckout(true);
		const originalRoute = posStack(view)?.routes[0];
		await act(async () => returnToTill(router, false, 'products'));
		await act(async () => {
			router.push({
				pathname: '/(app)/(drawer)/(pos)/(modals)/cart/[orderId]/checkout',
				params: { orderId: 'o2' },
			});
		});
		await act(async () => returnToTill(router, false, 'products'));
		expect(posStack(view)?.routes).toEqual([originalRoute]);
		expect(view.getSegments().slice(-3)).toEqual(['(columns)', 'cart', '[...orderId]']);
		expect(view.getPathname()).toBe('/cart/o1');
	});
});

describe('a wide checkout sheet hands off to the columns cart', () => {
	it('control: replacing the sheet with columns checkout leaves two POS routes', async () => {
		const { view } = await renderCheckout(true);
		await act(async () => router.replace(columnsCheckoutHref('o1')));
		expect(posStack(view)?.routes).toHaveLength(2);
		expect(posStack(view)?.routes.map((route) => route.name)).toEqual([
			'(columns)/cart/[...orderId]',
			'(columns)/cart/[...orderId]',
		]);
	});

	it('with the wide till beneath, pops to the original route', async () => {
		const { view } = await renderCheckout(true);
		const originalRoute = posStack(view)?.routes[0];
		await act(async () => leaveSheet(router, columnsCheckoutHref('o1')));
		expect(posStack(view)?.routes).toEqual([originalRoute]);
		expect(view.getPathname()).toBe('/cart/o1');
	});

	it('with the phone tabs beneath, leaves only the tabs route', async () => {
		const { view } = await renderCheckout(false);
		await act(async () => leaveSheet(router, columnsCheckoutHref('o1')));
		expect(posStack(view)?.routes.map((route) => route.name)).toEqual(['(tabs)']);
	});

	it('a cold-loaded sheet over the anchor is replaced by the columns checkout', async () => {
		const view = await renderDeepLinkCheckout();
		expect(posStack(view)?.routes.map((route) => route.name)).toEqual([
			'index',
			'(modals)/cart/[orderId]/checkout',
		]);
		// canDismiss reports true over the anchor, but popping would run its redirect to the till;
		// the anchor named beneath takes the replace, which keeps the unfocused anchor rendering nothing.
		await act(async () => leaveSheet(router, columnsCheckoutHref('o1'), 'index'));
		expect(posStack(view)?.routes.map((route) => route.name)).toEqual([
			'index',
			'(columns)/cart/[...orderId]',
		]);
		expect(view.getPathname()).toBe('/cart/o1/checkout');
	});

	it.each([
		['the anchor under a deep link', 'index', renderDeepLinkCheckout],
		[
			'the wide till under a pushed sheet',
			'(columns)/cart/[...orderId]',
			() => renderCheckout(true),
		],
	])("the checkout screen's (pos) navigation names %s", async (_, name, render) => {
		beneathCheckout = undefined;
		await render();
		expect(beneathCheckout).toBe(name);
	});

	it('returning a wide cold sheet to the till dismisses through the anchor to the columns', async () => {
		const view = await renderDeepLinkCheckout(() => (
			<Redirect href="/(app)/(drawer)/(pos)/(columns)" />
		));
		await act(async () => returnToTill(router, false, 'products'));
		expect(view.getSegments()[3]).toBe('(columns)');
	});
});

describe('reopening an order from Orders lands on its cart (#2374)', () => {
	async function renderOrders() {
		const view = await renderRouter(
			{
				...checkoutRoutes,
				'(app)/(drawer)/orders/index': () => <Text testID="orders" />,
			},
			{ initialUrl: '/orders' }
		);
		expect(view.getSegments()).toEqual(['(app)', '(drawer)', 'orders']);
		return view;
	}

	it('control: pushing /cart/[...orderId] selects columns', async () => {
		const view = await renderOrders();
		await act(async () => {
			router.push({ pathname: '/cart/[...orderId]', params: { orderId: ['o1'] } });
		});
		expect(view.getSegments()).toEqual([
			'(app)',
			'(drawer)',
			'(pos)',
			'(columns)',
			'cart',
			'[...orderId]',
		]);
	});

	it("on a phone, selects the cart in the phone's tabs", async () => {
		const view = await renderOrders();
		await act(async () => router.push(tillCartHref(true, 'o1')));
		expect(view.getSegments()).toEqual([
			'(app)',
			'(drawer)',
			'(pos)',
			'(tabs)',
			'cart',
			'[...orderId]',
		]);
		expect(view.getPathname()).toBe('/cart/o1');
	});

	it('when wide, still selects the columns cart', async () => {
		const view = await renderOrders();
		await act(async () => router.push(tillCartHref(false, 'o1')));
		expect(view.getSegments()).toEqual([
			'(app)',
			'(drawer)',
			'(pos)',
			'(columns)',
			'cart',
			'[...orderId]',
		]);
		expect(view.getPathname()).toBe('/cart/o1');
	});
});
