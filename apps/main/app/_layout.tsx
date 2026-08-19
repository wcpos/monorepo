import * as React from 'react';
import { Platform } from 'react-native';

import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { Uniwind, useUniwind } from 'uniwind';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { KeyboardProvider } from '@wcpos/components/keyboard-controller';
import { Toast, Toaster } from '@wcpos/components/toast';
import { useAppState } from '@wcpos/core/contexts/app-state';
import { HydrationProviders } from '@wcpos/core/contexts/hydration-providers';
import {
	isClearLocalDataOnNextLoadScheduled,
	unscheduleClearLocalDataOnNextLoad,
} from '@wcpos/database';
import { getLogger, setToast } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { RootError } from '../components/root-error';
import '../global.css';
import '../polyfills';

WebBrowser.maybeCompleteAuthSession();

const appLogger = getLogger(['wcpos', 'app', 'startup']);

/**
 * Forwards safe area insets to Uniwind for p-safe, m-safe, etc. utilities
 */
// function UniwindInsetSync() {
// 	const insets = React.useContext(SafeAreaInsetsContext);

// 	// Sync insets to Uniwind when they change
// 	React.useEffect(() => {
// 		if (insets) {
// 			Uniwind.updateInsets(insets);
// 		}
// 	}, [insets]);

// 	return null;
// }

/**
 * Restores the saved theme from the store document on app startup.
 * Returns true when theme restoration is complete.
 */
function useThemeRestorer() {
	const { store } = useAppState();
	const [restoredForStore, setRestoredForStore] = React.useState<unknown>(null);
	const [isThemeReady, setIsThemeReady] = React.useState(false);

	// Adjust state during render — sanctioned pattern, not an effect, not flagged.
	if (store && restoredForStore !== store) {
		setRestoredForStore(store);
		setIsThemeReady(true);
	}

	// External mutation belongs in a pre-paint effect; read store.theme directly.
	React.useLayoutEffect(() => {
		if (!store) return;
		const savedTheme = store.theme;
		if (savedTheme && savedTheme !== 'system') {
			Uniwind.setTheme(savedTheme);
		}
	}, [store]);

	return { isThemeReady, hasStore: !!store };
}

/**
 * Determines the appropriate toast theme based on the current Uniwind theme.
 * Light themes get 'light' toasts, dark themes get 'dark' toasts.
 */
function useToastTheme(): 'light' | 'dark' {
	const { theme } = useUniwind();
	// Light theme is the only "light" theme, all others are dark
	return theme === 'light' ? 'light' : 'dark';
}

function RootStack() {
	const { storeDB, store } = useAppState();
	const { isThemeReady } = useThemeRestorer();
	setToast(Toast.show);

	// Wait for theme to be ready when we have a store
	// This prevents the flash of default theme colors
	if (store && !isThemeReady) {
		return null;
	}

	return (
		<Stack screenOptions={{ headerShown: false }}>
			<Stack.Protected guard={!!storeDB}>
				<Stack.Screen name="(app)" />
			</Stack.Protected>
			<Stack.Screen name="(auth)" />
		</Stack>
	);
}

/**
 * Theme-aware Toaster wrapper that automatically switches between
 * light and dark toast themes based on the current Uniwind theme.
 */
function ThemedToaster() {
	const toastTheme = useToastTheme();

	return <Toaster position="top-center" theme={toastTheme} richColors />;
}

function useClearLocalDataOnStartup() {
	const [isClearing, setIsClearing] = React.useState(() => isClearLocalDataOnNextLoadScheduled());

	React.useEffect(() => {
		if (!isClearing) {
			return;
		}

		let cancelled = false;

		void (async () => {
			try {
				const { clearAllDB } = await import('@wcpos/database/clear-all-db');
				const result = await clearAllDB();
				unscheduleClearLocalDataOnNextLoad();

				if (result && typeof result === 'object' && 'message' in result) {
					appLogger.info(String(result.message));
				}

				if (cancelled) {
					return;
				}

				if (Platform.OS === 'web') {
					window.location.reload();
				} else {
					// Native has no page to reload, and none is needed: the layout renders
					// null while this runs, so nothing has opened the databases yet and
					// hydration starts fresh against the cleared state.
					setIsClearing(false);
				}
			} catch (error) {
				appLogger.error('Failed to clear local data before hydration', {
					code: ERROR_CODES.UNEXPECTED_ERROR,
					context: {
						error: error instanceof Error ? error.message : String(error),
					},
				});

				if (!cancelled) {
					setIsClearing(false);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [isClearing]);

	return isClearing;
}

export default function RootLayout() {
	const isClearingLocalData = useClearLocalDataOnStartup();

	if (isClearingLocalData) {
		return null;
	}

	return (
		<ErrorBoundary FallbackComponent={RootError}>
			<SafeAreaProvider style={{ overflow: 'hidden' }}>
				<GestureHandlerRootView style={{ flex: 1 }}>
					<KeyboardProvider>
						<HydrationProviders>
							<RootStack />
							<ErrorBoundary>
								<ThemedToaster />
							</ErrorBoundary>
						</HydrationProviders>
					</KeyboardProvider>
				</GestureHandlerRootView>
			</SafeAreaProvider>
		</ErrorBoundary>
	);
}
