import { Stack, Redirect } from 'expo-router';

import { useAppState } from '@wcpos/core/contexts/app-state';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: 'connect',
};

export default function AuthLayout() {
	const { storeDB } = useAppState();

	if (storeDB) {
		return <Redirect href="/" />;
	}

	return (
		<Stack screenOptions={{ headerShown: false }}>
			<Stack.Screen name="connect" />
			<Stack.Screen
				name="login"
				options={{
					presentation: 'transparentModal',
					animation: 'fade',
					headerShown: false,
				}}
			/>
		</Stack>
	);
}
