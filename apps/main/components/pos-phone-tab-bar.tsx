import * as React from 'react';
import { View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@wcpos/components/icon';
import { PressableSurface } from '@wcpos/components/pressable-surface';
import { Text } from '@wcpos/components/text';
import { useT } from '@wcpos/core/contexts/translations';

import type { BottomTabBarProps } from 'expo-router/tabs';

export type POSPhoneTab = 'products' | 'cart';

/** The tab bar's own bottom padding (`py-2`), kept above the home indicator. */
const TAB_BAR_PADDING = 8;

const TABS: { tab: POSPhoneTab; icon: IconName }[] = [
	{ tab: 'products', icon: 'gift' },
	{ tab: 'cart', icon: 'cart' },
];

/**
 * The phone till's Products / Cart tab bar, drawn by both routes that reach a phone: the (tabs)
 * navigator hands it its state (`tabBar`), and the (columns) resize fallback its own. Each tab is a
 * library surface, so it carries the tab role and the native press haptic; the bar pads the home
 * indicator inside its own card colour.
 */
export function POSPhoneTabBar({
	active,
	onSelect,
}: {
	active: POSPhoneTab;
	onSelect: (tab: POSPhoneTab) => void;
}) {
	const t = useT();
	const { bottom } = useSafeAreaInsets();
	const labels: Record<POSPhoneTab, string> = {
		products: t('common.products'),
		cart: t('pos_cart.tab_cart'),
	};
	return (
		<View
			testID="pos-tab-bar"
			role="tablist"
			className="border-border bg-card flex-row justify-around border-t pt-2"
			style={{ paddingBottom: bottom + TAB_BAR_PADDING }}
		>
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
					<Icon name={icon} variant={active === tab ? 'primary' : 'muted'} />
					<Text variant="help" className={active === tab ? 'text-primary' : undefined}>
						{labels[tab]}
					</Text>
				</PressableSurface>
			))}
		</View>
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
