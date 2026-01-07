import { Redirect, Stack } from 'expo-router';
import { SystemBars } from 'react-native-edge-to-edge';
import { useCSSVariable, useUniwind } from 'uniwind';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { PortalHost } from '@wcpos/components/portal';
import { useAppState } from '@wcpos/core/contexts/app-state';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: 'connect',
};

export default function AuthLayout() {
	const { storeDB } = useAppState();
	const { theme } = useUniwind();
	const backgroundColor = useCSSVariable('--color-background');

	if (storeDB) {
		return <Redirect href="/(app)" />;
	}

	/**
	 * Status bar style for auth screens:
	 * - Light theme: dark icons (background is light)
	 * - Dark themes: light icons (background is dark)
	 *
	 * This is handled by react-native-edge-to-edge which is the recommended
	 * approach for Expo SDK 54+ edge-to-edge displays.
	 */
	const statusBarStyle = theme === 'light' ? 'dark' : 'light';

	return (
		<>
			<SystemBars style={statusBarStyle} />
			<Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor } }}>
				<Stack.Screen name="connect" />
				{/* <Stack.Screen
					name="(modals)/login"
					options={{
						presentation: 'containedTransparentModal',
						animation: 'fade',
						contentStyle: { backgroundColor: 'transparent' },
					}}
				/> */}
			</Stack>
			<ErrorBoundary>
				<PortalHost />
			</ErrorBoundary>
		</>
	);
}
