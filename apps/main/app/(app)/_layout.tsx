import { Redirect, Stack } from 'expo-router';

import { useAppState } from '@wcpos/core/contexts/app-state';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: '(drawer)',
};

export default function AppLayout() {
	const { site, storeDB, fastStoreDB } = useAppState();

	if (!storeDB) {
		return <Redirect href="/(auth)/connect" />;
	}

	return (
		<Stack>
			<Stack.Screen
				name="(drawer)"
				options={{
					headerShown: false,
				}}
			/>
			<Stack.Screen
				name="(modal)/settings"
				options={{
					presentation: 'modal',
				}}
			/>
		</Stack>
	);
}
