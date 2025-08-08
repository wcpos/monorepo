import * as React from 'react';

import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { KeyboardProvider } from '@wcpos/components/keyboard-controller';
import { Toast, Toaster } from '@wcpos/components/toast';
import { useAppState } from '@wcpos/core/contexts/app-state';
import { HydrationProviders } from '@wcpos/core/contexts/hydration-providers';
import { setToast } from '@wcpos/utils/logger';

import { RootError } from '../components/root-error';
import '../global.css';
import '../polyfills';

WebBrowser.maybeCompleteAuthSession();

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: '(app)',
};

function RootStack() {
	const { storeDB } = useAppState();

	return (
		<Stack screenOptions={{ headerShown: false }}>
			<Stack.Protected guard={!!storeDB}>
				<Stack.Screen name="(app)" />
			</Stack.Protected>
			<Stack.Screen name="(auth)" />
		</Stack>
	);
}

export default function RootLayout() {
	React.useEffect(() => {
		// Logger works immediately with console, add Toast when ready
		setToast(Toast.show);
	}, []);

	return (
		<ErrorBoundary FallbackComponent={RootError}>
			<SafeAreaProvider style={{ overflow: 'hidden' }}>
				<GestureHandlerRootView style={{ flex: 1 }}>
					<KeyboardProvider>
						<HydrationProviders>
							<RootStack />
							<ErrorBoundary>
								<Toaster position="top-center" richColors />
							</ErrorBoundary>
						</HydrationProviders>
					</KeyboardProvider>
				</GestureHandlerRootView>
			</SafeAreaProvider>
		</ErrorBoundary>
	);
}
