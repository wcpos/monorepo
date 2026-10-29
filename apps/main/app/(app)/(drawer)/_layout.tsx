import * as React from 'react';
import { Platform, View } from 'react-native';

import { Drawer } from 'expo-router/drawer';
import { SystemBars } from 'react-native-edge-to-edge';
import { useCSSVariable, useUniwind } from 'uniwind';

import { useIsPhone } from '@wcpos/components/lib/device';
import type { IconName } from '@wcpos/components/icon';
import { useT } from '@wcpos/core/contexts/translations';
import { useAppInfo } from '@wcpos/core/hooks/use-app-info';
import { DrawerContent } from '@wcpos/core/screens/main/components/drawer-content';
import { useRailWidth } from '@wcpos/core/screens/main/components/drawer-content/rail';
import { LogsBadge } from '@wcpos/core/screens/main/components/drawer-content/logs-badge';
import {
	DrawerPanelVisibilityProvider,
	useDrawerPanelHidden,
} from '@wcpos/core/screens/main/components/drawer-content/panel-visibility';
import { SessionHoldProvider } from '@wcpos/core/screens/main/components/session-hold-banner';
import { RestartLockOverlay } from '@wcpos/core/screens/main/pos/cart/clear-local-data';
import { UpgradeNoticeContext } from '@wcpos/core/screens/main/components/upgrade-notice/context';

import { UnreadLogsProvider, useUnreadLogsCount } from '../../../components/unread-logs';
import { useNavigationBackground } from '../../../components/use-navigation-background';

/** Each drawer route's icon; the drawer item paints its tint. */
const DRAWER_ICONS: Record<string, IconName> = {
	'(pos)': 'register',
	products: 'gift',
	orders: 'receipt',
	coupons: 'discount',
	customers: 'customers',
	reports: 'reports',
	health: 'health',
	settings: 'settings',
	support: 'support',
};

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	anchor: '(pos)',
};

/**
 * Drawer wrapper that consumes theme-aware colors via `useCSSVariable`.
 * Isolated into its own component so that `DrawerLayout` does not subscribe
 * to theme changes (which would re-render the entire navigator and cancel
 * Uniwind's theme transition).
 */
function ThemedDrawer({
	phone,
	t,
	unreadErrorCount,
}: {
	phone: boolean;
	t: ReturnType<typeof useT>;
	unreadErrorCount: number;
}) {
	const screenBackgroundColor = useNavigationBackground();

	// A closed drawer is only translated off-screen, and Reanimated < 4.5.3 could revert that
	// transform to a stale value after a JS-thread stall, leaving the panel over the screen the
	// app has already navigated to (#1691; upstream reanimated#9965). Once it has settled closed
	// we take the panel out of layout with a static layout prop, which survives such a revert.
	// The library's own animated style honours this `display: 'none'` too
	// (patches/react-native-drawer-layout@4.2.10.patch), so the hide holds whichever side commits
	// last. Kept after the Reanimated bump as a guard (see panel-visibility.tsx). Native only:
	// the failure is a Reanimated/Fabric one, and the web drawer has no equivalent (inactive
	// screens there are already display:none). Never for the permanent rail, which is always on
	// screen.
	const panelSettledClosed = useDrawerPanelHidden();
	const hideDrawerPanel = Platform.OS !== 'web' && phone && panelSettledClosed;

	// Get theme-aware colors for navigation
	const [sidebarColor, sidebarBorderColor] = useCSSVariable([
		'--color-sidebar',
		'--color-sidebar-border',
	]) as string[];
	// Read on every width (a hook is never conditional); only the permanent rail uses it.
	const railWidth = useRailWidth();

	return (
		<Drawer
			screenOptions={{
				// Every screen carries its own bar (the register bar, or the page bar), so the
				// navigator draws none.
				headerShown: false,
				drawerType: phone ? 'front' : 'permanent',
				drawerStyle: {
					// Only ever ADDED, never set to 'flex': the library drives `display` itself
					// while it measures the panel, and we must not override that.
					...(hideDrawerPanel ? ({ display: 'none' } as const) : null),
					backgroundColor: sidebarColor,
					// The rail's width is set here, not by a class on its scroll view (which the
					// vendored view drops): 16 spacing units, the `size-12` item + 2 each side from
					// the gutter table, so 64 at Regular and the live step's value at the others.
					width: phone ? 200 : railWidth,
					borderRightColor: sidebarBorderColor,
					borderTopRightRadius: 0,
					borderBottomRightRadius: 0,
					paddingRight: 0,
					paddingLeft: 0,
				},
				drawerContentStyle: {
					paddingRight: 0,
					paddingLeft: 0,
				},
				sceneStyle: { backgroundColor: screenBackgroundColor },
			}}
			// An element, not a call: called as a function its hooks would run in the drawer's own
			// fiber, and a hook list that changed with the presentation would break React Compiler
			// ("Expected a constant size argument for each invocation of useMemoCache").
			drawerContent={(props) => (
				<DrawerContent
					{...props}
					presentation={phone ? 'front' : 'rail'}
					icons={DRAWER_ICONS}
					badges={{ health: <LogsBadge unread={unreadErrorCount} /> }}
				/>
			)}
		>
			<Drawer.Screen name="(pos)" options={{ title: t('common.pos') }} />
			<Drawer.Screen name="products" options={{ title: t('common.products') }} />
			<Drawer.Screen name="orders" options={{ title: t('common.orders') }} />
			<Drawer.Screen name="coupons" options={{ title: t('common.coupons') }} />
			<Drawer.Screen name="customers" options={{ title: t('common.customers') }} />
			<Drawer.Screen name="reports" options={{ title: t('common.reports') }} />
			<Drawer.Screen
				name="health"
				options={{
					title: t('common.store_health'),
					drawerItemStyle: { marginTop: 'auto' },
				}}
			/>
			<Drawer.Screen name="settings" options={{ title: t('common.settings') }} />
			<Drawer.Screen name="support" options={{ title: t('common.support') }} />
		</Drawer>
	);
}

function ThemedSystemBars() {
	const { theme } = useUniwind();
	return <SystemBars style={theme === 'light' ? 'dark' : 'light'} />;
}

function DrawerLayoutContent() {
	const phone = useIsPhone();
	const t = useT();

	const { license } = useAppInfo();
	// `showUpgrade` is dismissable local state (the notice closes itself), but it
	// must re-sync whenever the license's Pro status changes. We track the previous
	// `isPro` value and reset during render (React's "adjusting state during render"
	// pattern) instead of in an effect, avoiding a cascading re-render.
	const isPro = !!license?.isPro;
	const [showUpgrade, setShowUpgrade] = React.useState(!isPro);
	const [prevIsPro, setPrevIsPro] = React.useState(isPro);
	if (isPro !== prevIsPro) {
		setPrevIsPro(isPro);
		setShowUpgrade(!isPro);
	}
	const unreadErrorCount = useUnreadLogsCount();

	return (
		<UpgradeNoticeContext.Provider value={{ showUpgrade, setShowUpgrade }}>
			{/* One owner for the held-session state; each bar renders its own banner. */}
			<SessionHoldProvider>
				<View className="bg-background flex-1">
					<ThemedSystemBars />
					<RestartLockOverlay />
					<ThemedDrawer phone={phone} t={t} unreadErrorCount={unreadErrorCount} />
				</View>
			</SessionHoldProvider>
		</UpgradeNoticeContext.Provider>
	);
}

export default function DrawerLayout() {
	return (
		<UnreadLogsProvider>
			<DrawerPanelVisibilityProvider>
				<DrawerLayoutContent />
			</DrawerPanelVisibilityProvider>
		</UnreadLogsProvider>
	);
}
