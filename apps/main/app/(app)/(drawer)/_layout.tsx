import * as React from 'react';
import { Platform, View } from 'react-native';

import { Drawer } from 'expo-router/drawer';
import { SystemBars } from 'react-native-edge-to-edge';
import { useCSSVariable, useUniwind } from 'uniwind';

import { Icon } from '@wcpos/components/icon';
import { useTheme } from '@wcpos/core/contexts/theme';
import { useT } from '@wcpos/core/contexts/translations';
import { useAppInfo } from '@wcpos/core/hooks/use-app-info';
import { DrawerContent } from '@wcpos/core/screens/main/components/drawer-content';
import { DrawerContent as DrawerContentV2 } from '@wcpos/core/screens/main/components/drawer-content/v2';
import { LogsBadge } from '@wcpos/core/screens/main/components/drawer-content/logs-badge';
import {
	DrawerPanelVisibilityProvider,
	useDrawerPanelHidden,
} from '@wcpos/core/screens/main/components/drawer-content/panel-visibility';
import { Header } from '@wcpos/core/screens/main/components/header';
import { RestartLockOverlay } from '@wcpos/core/screens/main/pos/cart/clear-local-data';
import { UpgradeNoticeContext } from '@wcpos/core/screens/main/components/header/upgrade-notice-context';

import { UnreadLogsProvider, useUnreadLogsCount } from '../../../components/unread-logs';
import { useNavigationBackground } from '../../../components/use-navigation-background';

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
	screenSize,
	t,
	showUpgrade,
	setShowUpgrade,
	unreadErrorCount,
}: {
	screenSize: string;
	t: ReturnType<typeof useT>;
	showUpgrade: boolean;
	setShowUpgrade: () => void;
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
	const hideDrawerPanel = Platform.OS !== 'web' && screenSize !== 'lg' && panelSettledClosed;

	// Get theme-aware colors for navigation
	const [sidebarColor, sidebarBorderColor] = useCSSVariable([
		'--color-sidebar',
		'--color-sidebar-border',
	]) as string[];

	return (
		<Drawer
			screenOptions={{
				header: (props) => {
					return <Header {...props} showUpgrade={showUpgrade} setShowUpgrade={setShowUpgrade} />;
				},
				drawerType: screenSize === 'lg' ? 'permanent' : 'front',
				drawerStyle: {
					// Only ever ADDED, never set to 'flex': the library drives `display` itself
					// while it measures the panel, and we must not override that.
					...(hideDrawerPanel ? ({ display: 'none' } as const) : null),
					backgroundColor: sidebarColor,
					width: screenSize === 'lg' ? 'auto' : 200,
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
			// Elements, not calls: called as functions the rails' hooks ran in the drawer's own
			// fiber, so crossing `lg` swapped one hook list for another under the same fiber
			// (React Compiler: "Expected a constant size argument for each invocation of
			// useMemoCache … 39 but 22"). As elements the type changes and React remounts.
			drawerContent={(props) =>
				screenSize === 'lg' ? <DrawerContentV2 {...props} /> : <DrawerContent {...props} />
			}
		>
			<Drawer.Screen
				name="(pos)"
				options={{
					headerShown: false,
					title: t('common.pos'),
					drawerLabel: t('common.pos'),
					drawerIcon: ({ focused }) => (
						<Icon
							size="xl"
							name="cashRegister"
							className={focused ? 'text-primary' : 'text-sidebar-foreground'}
						/>
					),
				}}
			/>
			<Drawer.Screen
				name="products"
				options={{
					headerShown: false,
					title: t('common.products'),
					drawerLabel: t('common.products'),
					drawerIcon: ({ focused }) => (
						<Icon
							size="xl"
							name="gifts"
							className={focused ? 'text-primary' : 'text-sidebar-foreground'}
						/>
					),
				}}
			/>
			<Drawer.Screen
				name="orders"
				options={{
					headerShown: false,
					title: t('common.orders'),
					drawerLabel: t('common.orders'),
					drawerIcon: ({ focused }) => (
						<Icon
							size="xl"
							name="receipt"
							className={focused ? 'text-primary' : 'text-sidebar-foreground'}
						/>
					),
				}}
			/>
			<Drawer.Screen
				name="coupons"
				options={{
					headerShown: false,
					title: t('common.coupons'),
					drawerLabel: t('common.coupons'),
					drawerIcon: ({ focused }) => (
						<Icon
							size="xl"
							name="badgePercent"
							className={focused ? 'text-primary' : 'text-sidebar-foreground'}
						/>
					),
				}}
			/>
			<Drawer.Screen
				name="customers"
				options={{
					headerShown: false,
					title: t('common.customers'),
					drawerLabel: t('common.customers'),
					drawerIcon: ({ focused }) => (
						<Icon
							size="xl"
							name="users"
							className={focused ? 'text-primary' : 'text-sidebar-foreground'}
						/>
					),
				}}
			/>
			<Drawer.Screen
				name="reports"
				options={{
					title: t('common.reports'),
					headerShown: false,
					drawerLabel: t('common.reports'),
					drawerIcon: ({ focused }) => (
						<Icon
							size="xl"
							name="chartMixedUpCircleDollar"
							className={focused ? 'text-primary' : 'text-sidebar-foreground'}
						/>
					),
				}}
			/>
			<Drawer.Screen
				name="health"
				options={{
					title: t('common.store_health'),
					drawerLabel: t('common.store_health'),
					drawerIcon: ({ focused }) => (
						<View>
							<Icon
								size="xl"
								name="heartPulse"
								className={focused ? 'text-primary' : 'text-sidebar-foreground'}
							/>
							<LogsBadge count={unreadErrorCount} />
						</View>
					),
					drawerItemStyle: { marginTop: 'auto' },
				}}
			/>
			<Drawer.Screen
				name="settings"
				options={{
					headerShown: false,
					title: t('common.settings'),
					drawerLabel: t('common.settings'),
					drawerIcon: ({ focused }) => (
						<Icon
							size="xl"
							name="gear"
							className={focused ? 'text-primary' : 'text-sidebar-foreground'}
						/>
					),
				}}
			/>
			<Drawer.Screen
				name="support"
				options={{
					title: t('common.support'),
					drawerLabel: t('common.support'),
					drawerIcon: ({ focused }) => (
						<Icon
							size="xl"
							name="commentQuestion"
							className={focused ? 'text-primary' : 'text-sidebar-foreground'}
						/>
					),
				}}
			/>
		</Drawer>
	);
}

function ThemedSystemBars() {
	const { theme } = useUniwind();
	return <SystemBars style={theme === 'light' ? 'dark' : 'light'} />;
}

function DrawerLayoutContent() {
	const { screenSize } = useTheme();
	const t = useT();

	const { license } = useAppInfo();
	// `showUpgrade` is dismissable local state (the header can hide the banner), but it
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
			<View className="bg-background flex-1">
				<ThemedSystemBars />
				<RestartLockOverlay />
				<ThemedDrawer
					screenSize={screenSize}
					t={t}
					showUpgrade={showUpgrade}
					setShowUpgrade={() => setShowUpgrade(false)}
					unreadErrorCount={unreadErrorCount}
				/>
			</View>
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
