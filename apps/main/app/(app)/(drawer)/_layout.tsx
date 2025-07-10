import { Drawer } from 'expo-router/drawer';

import { Icon } from '@wcpos/components/icon';
import { useTheme } from '@wcpos/core/contexts/theme';
import { useT } from '@wcpos/core/contexts/translations';
import { DrawerContent } from '@wcpos/core/screens/main/components/drawer-content';
import { Header } from '@wcpos/core/screens/main/components/header';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: '(pos)',
};

export default function DrawerLayout() {
	const { screenSize } = useTheme();
	const t = useT();

	return (
		<Drawer
			screenOptions={{
				header: (props) => {
					return <Header {...props} showUpgrade={false} setShowUpgrade={() => {}} />;
				},
				drawerType: screenSize === 'lg' ? 'permanent' : 'front',
				drawerStyle: {
					backgroundColor: '#243B53',
					width: screenSize === 'lg' ? 'auto' : 200,
					borderRightColor: 'rgba(0, 0, 0, 0.2)',
					borderTopRightRadius: 0,
					borderBottomRightRadius: 0,
					paddingRight: 0,
					paddingLeft: 0,
				},
				drawerContentStyle: {
					paddingRight: 0,
					paddingLeft: 0,
				},
				sceneStyle: { backgroundColor: '#F0F4F8' },
			}}
			drawerContent={DrawerContent}
		>
			<Drawer.Screen
				name="(pos)"
				options={{
					title: t('POS', { _tags: 'core' }),
					drawerLabel: t('POS', { _tags: 'core' }),
					drawerIcon: ({ focused }) => (
						<Icon size="xl" name="cashRegister" className={focused && 'text-primary'} />
					),
				}}
			/>
			<Drawer.Screen
				name="products"
				options={{
					title: t('Products', { _tags: 'core' }),
					drawerLabel: t('Products', { _tags: 'core' }),
					drawerIcon: ({ focused }) => (
						<Icon size="xl" name="gifts" className={focused && 'text-primary'} />
					),
				}}
			/>
			<Drawer.Screen
				name="orders"
				options={{
					title: t('Orders', { _tags: 'core' }),
					drawerLabel: t('Orders', { _tags: 'core' }),
					drawerIcon: ({ focused }) => (
						<Icon size="xl" name="receipt" className={focused && 'text-primary'} />
					),
				}}
			/>
			<Drawer.Screen
				name="customers"
				options={{
					title: t('Customers', { _tags: 'core' }),
					drawerLabel: t('Customers', { _tags: 'core' }),
					drawerIcon: ({ focused }) => (
						<Icon size="xl" name="users" className={focused && 'text-primary'} />
					),
				}}
			/>
			<Drawer.Screen
				name="reports"
				options={{
					title: t('Reports', { _tags: 'core' }),
					drawerLabel: t('Reports', { _tags: 'core' }),
					drawerIcon: ({ focused }) => (
						<Icon size="xl" name="chartMixedUpCircleDollar" className={focused && 'text-primary'} />
					),
				}}
			/>
			<Drawer.Screen
				name="logs"
				options={{
					title: t('Logs', { _tags: 'core' }),
					drawerLabel: t('Logs', { _tags: 'core' }),
					drawerIcon: ({ focused }) => (
						<Icon size="xl" name="heartPulse" className={focused && 'text-primary'} />
					),
					drawerItemStyle: { marginTop: 'auto' },
				}}
			/>
			<Drawer.Screen
				name="support"
				options={{
					title: t('Support', { _tags: 'core' }),
					drawerLabel: t('Support', { _tags: 'core' }),
					drawerIcon: ({ focused }) => (
						<Icon size="xl" name="commentQuestion" className={focused && 'text-primary'} />
					),
				}}
			/>
		</Drawer>
	);
}
