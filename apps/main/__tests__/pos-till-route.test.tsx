import * as React from 'react';
import { Text } from 'react-native';

import { Redirect, router, Slot, Stack, Tabs } from 'expo-router';
import { act, renderRouter } from 'expo-router/testing-library';

import {
	handSheetToColumns,
	returnToTill,
} from '../../../packages/core/src/screens/main/pos/checkout/till-route';

const checkoutRoutes = {
	'(app)/_layout': () => <Slot />,
	'(app)/(drawer)/_layout': () => <Slot />,
	'(app)/(drawer)/(pos)/_layout': () => <Stack />,
	// expo-router breaks the /cart tie by config order, which on disk is alphabetical.
	'(app)/(drawer)/(pos)/(columns)/index': () => <Text testID="columns-index" />,
	'(app)/(drawer)/(pos)/(columns)/cart/index': () => <Text testID="columns-cart" />,
	'(app)/(drawer)/(pos)/(columns)/cart/[...orderId]': () => <Text testID="columns-cart" />,
	'(app)/(drawer)/(pos)/(modals)/cart/[orderId]/checkout': () => <Text testID="checkout-modal" />,
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

async function renderDeepLinkCheckout() {
	return renderRouter(
		{
			...checkoutRoutes,
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
		await act(async () =>
			router.replace({
				pathname: '/(app)/(drawer)/(pos)/(columns)/cart/[...orderId]',
				params: { orderId: ['o1', 'checkout'] },
			})
		);
		expect(posStack(view)?.routes).toHaveLength(2);
		expect(posStack(view)?.routes.map((route) => route.name)).toEqual([
			'(columns)/cart/[...orderId]',
			'(columns)/cart/[...orderId]',
		]);
	});

	it('with the wide till beneath, pops to the original route', async () => {
		const { view } = await renderCheckout(true);
		const originalRoute = posStack(view)?.routes[0];
		await act(async () => handSheetToColumns(router, 'o1'));
		expect(posStack(view)?.routes).toEqual([originalRoute]);
		expect(view.getPathname()).toBe('/cart/o1');
	});

	it('with the phone tabs beneath, leaves only the tabs route', async () => {
		const { view } = await renderCheckout(false);
		await act(async () => handSheetToColumns(router, 'o1'));
		expect(posStack(view)?.routes.map((route) => route.name)).toEqual(['(tabs)']);
	});

	it('a cold-loaded sheet over the anchor is replaced by the columns checkout', async () => {
		const view = await renderDeepLinkCheckout();
		expect(posStack(view)?.routes.map((route) => route.name)).toEqual([
			'index',
			'(modals)/cart/[orderId]/checkout',
		]);
		// The seeded stack is typeless (expo-router's canDismiss has a TODO for it), so the sheet
		// cannot be popped; the replace keeps the unfocused anchor beneath, which renders nothing.
		await act(async () => handSheetToColumns(router, 'o1'));
		expect(posStack(view)?.routes.map((route) => route.name)).toEqual([
			'index',
			'(columns)/cart/[...orderId]',
		]);
		expect(view.getPathname()).toBe('/cart/o1/checkout');
	});
});
