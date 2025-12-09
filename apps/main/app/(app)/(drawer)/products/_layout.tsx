import { Stack } from 'expo-router';
import { useCSSVariable } from 'uniwind';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: 'index',
};

export default function ProductsLayout() {
	const backgroundColor = useCSSVariable('--color-background');

	return (
		<Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor } }}>
			<Stack.Screen name="index" />
			<Stack.Screen
				name="(modals)/edit/product/[productId]"
				options={{
					presentation: 'containedTransparentModal',
					animation: 'fade',
					contentStyle: { backgroundColor: 'transparent' },
				}}
			/>
			<Stack.Screen
				name="(modals)/edit/variation/[variationId]"
				options={{
					presentation: 'containedTransparentModal',
					animation: 'fade',
					contentStyle: { backgroundColor: 'transparent' },
				}}
			/>
		</Stack>
	);
}
