import { Stack, Redirect } from 'expo-router';
// import * as StatusBar from 'expo-status-bar';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { PortalHost } from '@wcpos/components/portal';
import { useAppState } from '@wcpos/core/contexts/app-state';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: 'connect',
};

export default function AuthLayout() {
	const { storeDB } = useAppState();
	// StatusBar.setStatusBarStyle('dark', true);
	// StatusBar.setStatusBarTranslucent(true);

	if (storeDB) {
		return <Redirect href="/(app)" />;
	}

	return (
		<>
			<Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F0F4F8' } }}>
				<Stack.Screen name="connect" />
				<Stack.Screen
					name="(modals)/login"
					options={{
						presentation: 'containedTransparentModal',
						animation: 'fade',
						contentStyle: { backgroundColor: 'transparent' },
					}}
				/>
			</Stack>
			<ErrorBoundary>
				<PortalHost />
			</ErrorBoundary>
		</>
	);
}
