import * as React from 'react';
import { View } from 'react-native';

import { EdgeSurface } from '@wcpos/components/edge-surface';
import { Icon, type IconName } from '@wcpos/components/icon';
import { PressableSurface } from '@wcpos/components/pressable-surface';
import { Text } from '@wcpos/components/text';
import { useT } from '@wcpos/core/contexts/translations';
import { CartTabCount } from '@wcpos/core/screens/main/pos/cart/cart-tab-count';

import type { BottomTabBarProps } from 'expo-router/tabs';

export type POSPhoneTab = 'products' | 'cart';

const BOTTOM = ['bottom'] as const;

const TABS: { tab: POSPhoneTab; icon: IconName }[] = [
	{ tab: 'products', icon: 'gift' },
	{ tab: 'cart', icon: 'cart' },
];

/**
 * The phone till's Products / Cart tab bar, drawn by both routes that reach a phone: the (tabs)
 * navigator hands it its state (`tabBar`), and the (columns) resize fallback its own. Each tab is a
 * library surface, so it carries the tab role and the native press haptic; the bar pads the home
 * indicator inside its own card colour. The Cart tab counts the cart over its icon (Paul,
 * 2026-10-28): both routes sit under `CurrentOrderProvider` (the (pos) layout), so it can.
 */
export function POSPhoneTabBar({
	active,
	onSelect,
}: {
	active: POSPhoneTab;
	onSelect: (tab: POSPhoneTab) => void;
}) {
	const t = useT();
	const labels: Record<POSPhoneTab, string> = {
		products: t('common.products'),
		cart: t('pos_cart.tab_cart'),
	};
	return (
		// The bar's own `py-2` sits above the home indicator, which the surface pads in its colour.
		<EdgeSurface testID="pos-tab-bar" edges={BOTTOM} className="border-border bg-card border-t">
			<View role="tablist" className="flex-row justify-around py-2">
				{TABS.map(({ tab, icon }) => (
					<PressableSurface
						key={tab}
						role="tab"
						selected={active === tab}
						wash="none"
						testID={`pos-tab-${tab}`}
						onPress={() => onSelect(tab)}
						className="flex-1 items-center gap-1 py-2"
					>
						{tab === 'cart' ? (
							// The badge's left edge two thirds across the 18 icon, hanging off its right.
							<View>
								<Icon name={icon} variant={active === tab ? 'primary' : 'muted'} />
								<View className="absolute -top-2 left-3">
									<CartTabCount />
								</View>
							</View>
						) : (
							<Icon name={icon} variant={active === tab ? 'primary' : 'muted'} />
						)}
						<Text variant="help" className={active === tab ? 'text-primary' : undefined}>
							{labels[tab]}
						</Text>
					</PressableSurface>
				))}
			</View>
		</EdgeSurface>
	);
}

/** The (tabs) navigator's route for each tab: Products is the group's `index`. */
const ROUTE: Record<POSPhoneTab, string> = { products: 'index', cart: 'cart' };

/** The (tabs) navigator's `tabBar`: its state, drawn by the one phone tab bar. */
export function POSNavigatorTabBar({
	state,
	navigateToTab,
}: Pick<BottomTabBarProps, 'state' | 'navigateToTab'>) {
	const focused = state.routes[state.index]?.name;
	return (
		<POSPhoneTabBar
			active={focused === ROUTE.cart ? 'cart' : 'products'}
			onSelect={(tab) => {
				const route = state.routes.find((candidate) => candidate.name === ROUTE[tab]);
				if (route && route.name !== focused) navigateToTab(route.key);
			}}
		/>
	);
}
