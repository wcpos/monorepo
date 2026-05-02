import { View } from 'react-native';

import { Redirect, Stack } from 'expo-router';
import { SystemBars } from 'react-native-edge-to-edge';
import { useUniwind } from 'uniwind';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { PortalHost } from '@wcpos/components/portal';
import { useAppState } from '@wcpos/core/contexts/app-state';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: 'connect',
};

/**
 * Status bar style for auth screens.
 * - Light theme: dark icons (background is light)
 * - Dark themes: light icons (background is dark)
 *
 * Isolated into its own component so that `useUniwind()` does not cause
 * the entire auth stack to re-render on theme change (which cancels
 * Uniwind's theme transition).
 */
function ThemedSystemBars() {
	const { theme } = useUniwind();
	const statusBarStyle = theme === 'light' ? 'dark' : 'light';
	return <SystemBars style={statusBarStyle} />;
}

export default function AuthLayout() {
	const { storeDB } = useAppState();

	if (storeDB) {
		return <Redirect href="/(app)" />;
	}

	return (
		<>
			<ThemedSystemBars />
			<View className="bg-background flex-1">
				<Stack
					screenOptions={{
						headerShown: false,
						contentStyle: { backgroundColor: 'transparent' },
					}}
				>
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
			</View>
			<ErrorBoundary>
				<PortalHost />
			</ErrorBoundary>
		</>
	);
}
