import { useWindowDimensions } from 'react-native';

import { Stack } from 'expo-router';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: 'index',
};

export default function CartLayout() {
	const dimensions = useWindowDimensions();
	const largeScreen = dimensions.width >= 640;

	return (
		<Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F0F4F8' } }}>
			<Stack.Screen name={largeScreen ? 'index' : '(tabs)'} />
			<Stack.Screen
				name="cart/[orderId]/checkout"
				options={{
					presentation: 'modal',
				}}
			/>
			<Stack.Screen
				name="cart/receipt/[orderId]"
				options={{
					presentation: 'modal',
				}}
			/>
		</Stack>
	);
}
