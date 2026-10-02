import * as React from 'react';
import { Text } from 'react-native';

import { Redirect, router, Slot, Stack, Tabs } from 'expo-router';
import { act, renderRouter } from 'expo-router/testing-library';

import { returnToTill } from '../../../packages/core/src/screens/main/pos/checkout/till-route';

async function renderCheckout() {
	const view = renderRouter(
		{
			'(app)/_layout': () => <Slot />,
			'(app)/(drawer)/_layout': () => <Slot />,
			'(app)/(drawer)/(pos)/_layout': () => <Stack />,
			// expo-router breaks the /cart tie by config order, which on disk is alphabetical.
			'(app)/(drawer)/(pos)/(columns)/index': () => <Text testID="columns-index" />,
			'(app)/(drawer)/(pos)/(columns)/cart/index': () => <Text testID="columns-cart" />,
			'(app)/(drawer)/(pos)/(columns)/cart/[...orderId]': () => <Text testID="columns-cart" />,
			'(app)/(drawer)/(pos)/(modals)/cart/[orderId]/checkout': () => (
				<Text testID="checkout-modal" />
			),
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
		},
		{ initialUrl: '/' }
	);
	await view;
	expect(view.getSegments()).toEqual(['(app)', '(drawer)', '(pos)', '(tabs)']);
	await act(async () => router.navigate('/(app)/(drawer)/(pos)/(tabs)/cart'));
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
		const posStack = view
			.getRouterState()
			?.routes.find((route) => route.name === '__root')
			?.state?.routes.find((route) => route.name === '(app)')
			?.state?.routes.find((route) => route.name === '(drawer)')
			?.state?.routes.find((route) => route.name === '(pos)')?.state;
		expect(posStack?.routes.map((route) => route.name)).toEqual(['(tabs)']);
		expect(posStack?.routes[0].state?.index).toBe(0);
	});

	it('dismisses to the Cart tab when checkout is abandoned', async () => {
		const { view } = await renderCheckout();
		await act(async () => returnToTill(router, true, 'cart'));
		expect(view.getSegments()).toEqual(['(app)', '(drawer)', '(pos)', '(tabs)', 'cart']);
		const posStack = view
			.getRouterState()
			?.routes.find((route) => route.name === '__root')
			?.state?.routes.find((route) => route.name === '(app)')
			?.state?.routes.find((route) => route.name === '(drawer)')
			?.state?.routes.find((route) => route.name === '(pos)')?.state;
		expect(posStack?.routes.map((route) => route.name)).toEqual(['(tabs)']);
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
		const posStack = view
			.getRouterState()
			?.routes.find((route) => route.name === '__root')
			?.state?.routes.find((route) => route.name === '(app)')
			?.state?.routes.find((route) => route.name === '(drawer)')
			?.state?.routes.find((route) => route.name === '(pos)')?.state;
		expect(posStack?.routes.map((route) => route.name)).toEqual(['(tabs)']);
	});
});
