import { Stack } from 'expo-router';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: 'index',
};

export default function CartLayout() {
	return (
		<Stack screenOptions={{ headerShown: false }}>
			<Stack.Screen name="index" />
			<Stack.Screen
				name="cart/[orderID]/checkout"
				options={{
					presentation: 'modal',
				}}
			/>
			<Stack.Screen
				name="cart/receipt/[orderID]"
				options={{
					presentation: 'modal',
				}}
			/>
		</Stack>
	);
}
