import { Stack } from 'expo-router';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: 'index',
};

export default function OrdersLayout() {
	return (
		<Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F0F4F8' } }}>
			<Stack.Screen name="index" />
			<Stack.Screen
				name="edit/[orderId]"
				options={{
					presentation: 'modal',
				}}
			/>
			<Stack.Screen
				name="receipt/[orderId]"
				options={{
					presentation: 'modal',
				}}
			/>
		</Stack>
	);
}
