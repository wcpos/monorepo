import { Keyboard, TouchableWithoutFeedback, View } from 'react-native';

import { Slot } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { KeyboardProvider } from '@wcpos/components/keyboard-controller';
import { Toast, toastConfig } from '@wcpos/components/toast';
import { HydrationProviders } from '@wcpos/core/contexts/hydration-providers';

import '../global.css';
import '../polyfills';
import { RootError } from '../components/root-error';
// import { initializeImmersiveMode } from '../hooks/use-sticky-immersive-reset';

// initializeImmersiveMode();
export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: '(app)',
};

export default function RootLayout() {
	return (
		<ErrorBoundary FallbackComponent={RootError}>
			{/* <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
				<View style={{ flex: 1 }}> */}
			<SafeAreaProvider style={{ overflow: 'hidden' }}>
				<GestureHandlerRootView style={{ flex: 1 }}>
					<KeyboardProvider>
						<HydrationProviders>
							<Slot />
							<ErrorBoundary>
								<Toast config={toastConfig} />
							</ErrorBoundary>
						</HydrationProviders>
					</KeyboardProvider>
				</GestureHandlerRootView>
			</SafeAreaProvider>
			{/* </View>
			</TouchableWithoutFeedback> */}
		</ErrorBoundary>
	);
}
