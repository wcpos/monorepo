import { Stack } from 'expo-router';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: 'index',
};

export default function CustomersLayout() {
	return (
		<Stack screenOptions={{ headerShown: false }}>
			<Stack.Screen name="index" />
			<Stack.Screen
				name="edit/[customerId]"
				options={{
					presentation: 'modal',
				}}
			/>
			<Stack.Screen
				name="add"
				options={{
					presentation: 'modal',
				}}
			/>
		</Stack>
	);
}
