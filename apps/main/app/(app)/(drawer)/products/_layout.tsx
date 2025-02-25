import { Stack } from 'expo-router';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: 'index',
};

export default function ProductsLayout() {
	return (
		<Stack screenOptions={{ headerShown: false }}>
			<Stack.Screen name="index" />
			<Stack.Screen
				name="edit/product/[productId]"
				options={{
					presentation: 'modal',
				}}
			/>
			<Stack.Screen
				name="edit/variation/[variationId]"
				options={{
					presentation: 'modal',
				}}
			/>
		</Stack>
	);
}
