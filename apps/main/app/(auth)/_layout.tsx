import { Stack, Redirect } from 'expo-router';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { PortalHost } from '@wcpos/components/portal';
import { useAppState } from '@wcpos/core/contexts/app-state';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: 'connect',
};

export default function AuthLayout() {
	const { storeDB } = useAppState();

	if (storeDB) {
		return <Redirect href="/(app)/(drawer)/cart/[[orderId]]" />;
	}

	return (
		<>
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
			<ErrorBoundary>
				<PortalHost />
			</ErrorBoundary>
		</>
	);
}
