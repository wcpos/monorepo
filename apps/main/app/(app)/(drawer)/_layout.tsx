import * as React from 'react';
import { View } from 'react-native';

import { Drawer } from 'expo-router/drawer';
import { useCSSVariable } from 'uniwind';

import { Icon } from '@wcpos/components/icon';
import { useTheme } from '@wcpos/core/contexts/theme';
import { useT } from '@wcpos/core/contexts/translations';
import { useAppInfo } from '@wcpos/core/hooks/use-app-info';
import { DrawerContent } from '@wcpos/core/screens/main/components/drawer-content';
import { LogsBadge } from '@wcpos/core/screens/main/components/drawer-content/logs-badge';
import { Header } from '@wcpos/core/screens/main/components/header';

import { UnreadLogsProvider, useUnreadLogs } from '../../../components/unread-logs';
import { useNavigationBackground } from '../../../components/use-navigation-background';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: '(pos)',
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
			drawerContent={DrawerContent}
		>
			<Drawer.Screen
				name="(pos)"
				options={{
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
					title: t('common.store_health', 'Store health'),
					drawerLabel: t('common.store_health', 'Store health'),
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
	const { count: unreadErrorCount } = useUnreadLogs();

	return (
		<View className="bg-background flex-1">
			<ThemedDrawer
				screenSize={screenSize}
				t={t}
				showUpgrade={showUpgrade}
				setShowUpgrade={() => setShowUpgrade(false)}
				unreadErrorCount={unreadErrorCount}
			/>
		</View>
	);
}

export default function DrawerLayout() {
	return (
		<UnreadLogsProvider>
			<DrawerLayoutContent />
		</UnreadLogsProvider>
	);
}
