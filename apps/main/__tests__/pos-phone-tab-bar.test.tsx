import * as React from 'react';

import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { POSNavigatorTabBar, POSPhoneTabBar } from '../components/pos-phone-tab-bar';

// Reset at module scope to avoid jest-expo's winter-runtime "require outside test scope" error.
jest.resetModules();

jest.mock('react-native/Libraries/Components/Pressable/Pressable', () => ({
	default: 'Pressable',
}));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: {} }));
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 20, left: 0 }),
}));
jest.mock('@wcpos/core/contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@rn-primitives/slot', () => ({ Slot: 'Slot' }));

let view: ReactTestRenderer | undefined;
afterEach(() => act(() => view?.unmount()));

const tab = (id: string) => view!.root.findByProps({ testID: id });
const labels = () =>
	view!.root
		.findAll((node) => typeof node.props.children === 'string')
		.map((n) => n.props.children);

// The one phone tab bar both POS routes draw: translated labels, the selected tab announced, the
// home indicator padded inside the bar.
it('draws Products and Cart, marks the active tab and hands a press back', () => {
	const onSelect = jest.fn();
	act(() => {
		view = create(<POSPhoneTabBar active="cart" onSelect={onSelect} />);
	});
	expect(labels()).toEqual(expect.arrayContaining(['common.products', 'pos_cart.tab_cart']));
	expect(tab('pos-tab-cart').props.selected).toBe(true);
	expect(tab('pos-tab-products').props.selected).toBe(false);
	expect(tab('pos-tab-bar').props.style).toEqual({ paddingBottom: 28 });
	act(() => tab('pos-tab-products').props.onPress());
	expect(onSelect).toHaveBeenCalledWith('products');
});

// The (tabs) navigator's adapter: its focused route is the active tab, and a press on the other
// tab navigates to that route's key (Products is the group's `index`); the focused one is a no-op.
it('maps the (tabs) navigator state onto the bar', () => {
	const navigateToTab = jest.fn();
	const state = {
		index: 0,
		routes: [
			{ key: 'index-1', name: 'index' },
			{ key: 'cart-1', name: 'cart' },
		],
	};
	act(() => {
		view = create(<POSNavigatorTabBar state={state} navigateToTab={navigateToTab} />);
	});
	expect(tab('pos-tab-products').props.selected).toBe(true);
	act(() => tab('pos-tab-products').props.onPress());
	expect(navigateToTab).not.toHaveBeenCalled();
	act(() => tab('pos-tab-cart').props.onPress());
	expect(navigateToTab).toHaveBeenCalledWith('cart-1');
});
