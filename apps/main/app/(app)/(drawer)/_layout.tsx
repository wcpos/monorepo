import * as React from 'react';
import { View } from 'react-native';

import { Drawer } from 'expo-router/drawer';
import { useCSSVariable } from 'uniwind';

import { Icon } from '@wcpos/components/icon';
import { useTheme } from '@wcpos/core/contexts/theme';
import { useT } from '@wcpos/core/contexts/translations';
import { useAppInfo } from '@wcpos/core/hooks/use-app-info';
import { DrawerContent } from '@wcpos/core/screens/main/components/drawer-content';
import {
	LogsBadge,
	useUnreadErrorCount,
} from '@wcpos/core/screens/main/components/drawer-content/logs-badge';
import { Header } from '@wcpos/core/screens/main/components/header';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: '(pos)',
};

export default function DrawerLayout() {
	const { screenSize } = useTheme();
	const t = useT();

	// Get theme-aware colors for navigation
	const [sidebarColor, sidebarBorderColor, backgroundColor] = useCSSVariable([
		'--color-sidebar',
		'--color-sidebar-border',
		'--color-background',
	]) as string[];

	//
	const { license } = useAppInfo();
	const [showUpgrade, setShowUpgrade] = React.useState(!license?.isPro);
	const { count: unreadErrorCount, markAsRead: markLogsAsRead } = useUnreadErrorCount();

	return (
		<Drawer
			screenOptions={{
				header: (props) => {
					return (
						<Header
							{...props}
							showUpgrade={showUpgrade}
							setShowUpgrade={() => setShowUpgrade(false)}
						/>
					);
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
				sceneStyle: { backgroundColor },
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
				name="logs"
				listeners={{
					focus: () => markLogsAsRead(),
				}}
				options={{
					title: t('common.logs'),
					drawerLabel: t('common.logs'),
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
