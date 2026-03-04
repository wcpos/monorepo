import { Stack } from 'expo-router';
import { useCSSVariable } from 'uniwind';

export const unstable_settings = {
	initialRouteName: 'index',
};

export default function CouponsLayout() {
	const backgroundColor = useCSSVariable('--color-background');

	return (
		<Stack
			screenOptions={{
				headerShown: false,
				contentStyle: { backgroundColor: backgroundColor as string },
			}}
		>
			<Stack.Screen name="index" />
			<Stack.Screen
				name="(modals)/edit/[couponId]"
				options={{
					presentation: 'containedTransparentModal',
					animation: 'fade',
					contentStyle: { backgroundColor: 'transparent' },
				}}
			/>
			<Stack.Screen
				name="(modals)/add"
				options={{
					presentation: 'containedTransparentModal',
					animation: 'fade',
					contentStyle: { backgroundColor: 'transparent' },
				}}
			/>
		</Stack>
	);
}
