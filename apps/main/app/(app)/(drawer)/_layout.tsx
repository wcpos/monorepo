import { Link } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: '(pos)',
};

export default function DrawerLayout() {
	// This layout can be deferred because it's not the root layout.
	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<Drawer
				screenOptions={{
					headerRight: (props) => {
						return <Link href="/(app)/(modal)/settings">Present modal</Link>;
						// <Header {...props} showUpgrade={showUpgrade} setShowUpgrade={setShowUpgrade} />
					},
					// drawerType: largeScreen ? 'permanent' : 'front',
					// drawerStyle: {
					// 	backgroundColor: theme.colors.headerBackground,
					// 	width: largeScreen ? 'auto' : undefined,
					// 	borderRightColor: 'rgba(0, 0, 0, 0.2)',
					// 	// borderRightWidth: 0,
					// },
					// sceneContainerStyle: { height: '100%' }, // important to set height to 100% to avoid scrolling
				}}
			>
				<Drawer.Screen
					name="(pos)"
					options={{
						drawerLabel: 'POS',
						title: 'POS',
					}}
				/>
				<Drawer.Screen
					name="products"
					options={{
						drawerLabel: 'Products',
						title: 'Products',
					}}
				/>
				<Drawer.Screen
					name="orders"
					options={{
						drawerLabel: 'Orders',
						title: 'Orders',
					}}
				/>
				<Drawer.Screen
					name="support"
					options={{
						drawerLabel: 'Support',
						title: 'Support',
					}}
				/>
			</Drawer>
		</GestureHandlerRootView>
	);
}
