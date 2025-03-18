import { Slot } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Toast, toastConfig } from '@wcpos/components/toast';
import { HydrationProviders } from '@wcpos/core/contexts/hydration-providers';

import '../global.css';
import '../polyfills';
import { RootError } from '../components/root-error';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: '(app)',
};

export default function RootLayout() {
	return (
		<ErrorBoundary FallbackComponent={RootError}>
			<GestureHandlerRootView style={{ flex: 1 }}>
				<SafeAreaProvider style={{ overflow: 'hidden' }}>
					<HydrationProviders>
						<Slot />
						<ErrorBoundary>
							<Toast config={toastConfig} />
						</ErrorBoundary>
					</HydrationProviders>
				</SafeAreaProvider>
			</GestureHandlerRootView>
		</ErrorBoundary>
	);
}
