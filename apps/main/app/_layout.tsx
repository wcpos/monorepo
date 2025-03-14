import { Slot } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';
import { Toast, toastConfig } from '@wcpos/components/toast';
import { AppStateProvider } from '@wcpos/core/contexts/app-state';
import { TranslationProvider } from '@wcpos/core/contexts/translations';

import RootError from '../components/root-error';
import { Splash } from '../components/splash-screen';

import '../global.css';
import '../polyfills';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: '(app)',
};

/**
 * Initial Props
 * - only web at the moment, but may be useful for other platforms in the future
 */
let initialProps: Record<string, unknown> = {};
if (globalThis.initialProps) {
	initialProps = Object.freeze(globalThis.initialProps); // prevent accidental mutation
}

export default function RootLayout() {
	return (
		<ErrorBoundary FallbackComponent={RootError}>
			<GestureHandlerRootView style={{ flex: 1 }}>
				<Suspense
					/**
					 * First suspense to load the initial app state
					 * - we now have site, user, store, etc if the user is logged in
					 */
					fallback={<Splash progress={33} />}
				>
					<AppStateProvider initialProps={initialProps}>
						<Suspense
							/**
							 * Second suspense to allow anything else to load that depends on the app state
							 * - translations, theme, etc
							 * - in the future it might be nice to have a loading screen that shows progress for initial load
							 */
							fallback={<Splash progress={66} />}
						>
							<ErrorBoundary>
								<TranslationProvider>
									<SafeAreaProvider style={{ overflow: 'hidden' }}>
										<Suspense fallback={<Splash progress={100} />}>
											<ErrorBoundary>
												<Slot />
											</ErrorBoundary>
										</Suspense>
										<ErrorBoundary>
											<Toast config={toastConfig} />
										</ErrorBoundary>
									</SafeAreaProvider>
								</TranslationProvider>
							</ErrorBoundary>
						</Suspense>
					</AppStateProvider>
				</Suspense>
			</GestureHandlerRootView>
		</ErrorBoundary>
	);
}
