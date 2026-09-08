import * as React from 'react';

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
import { createMerchantToast } from '@wcpos/core/contexts/merchant-toast';
import { useT } from '@wcpos/core/contexts/translations';
import { useTelemetryConsent } from '@wcpos/core/hooks/use-telemetry-consent';
import { useCustomerDisplayService } from '@wcpos/core/screens/main/pos/customer-display/use-customer-display-service';
import { setToast } from '@wcpos/utils/logger';

import {
	ClearLocalDataBlockedScreen,
	useClearLocalDataOnStartup,
} from '../components/clear-local-data-on-startup';
import { RootError } from '../components/root-error';
import '../global.css';
import '../polyfills';

WebBrowser.maybeCompleteAuthSession();

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
			Uniwind.setTheme(savedTheme as Parameters<typeof Uniwind.setTheme>[0]);
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
	useTelemetryConsent();
	const t = useT();
	// `Toast.show` on its own would print the developer log message when a call
	// site logs `showToast: true` without cashier copy. The adapter resolves the
	// error code's translated sentence first; it is re-created whenever `t`
	// changes identity so a language switch takes effect on the next toast.
	setToast(createMerchantToast(t, Toast.show));

	// Wait for theme to be ready when we have a store
	// This prevents the flash of default theme colors
	if (store && !isThemeReady) {
		return null;
	}

	return (
		<>
			{storeDB ? <CustomerDisplayServiceController /> : null}
			<Stack screenOptions={{ headerShown: false }}>
				<Stack.Protected guard={!!storeDB}>
					<Stack.Screen name="(app)" />
				</Stack.Protected>
				<Stack.Screen name="(auth)" />
			</Stack>
		</>
	);
}

function CustomerDisplayServiceController(): null {
	useCustomerDisplayService();
	return null;
}

/**
 * Theme-aware Toaster wrapper that automatically switches between
 * light and dark toast themes based on the current Uniwind theme.
 */
function ThemedToaster() {
	const toastTheme = useToastTheme();

	return <Toaster position="top-center" theme={toastTheme} richColors />;
}

export default function RootLayout() {
	const clearLocalDataState = useClearLocalDataOnStartup();

	if (clearLocalDataState === 'clearing') {
		return null;
	}

	// Fail closed: a failed or unverifiable clear leaves the reset flag armed,
	// and hydrating would let its retry destroy everything sold before the next
	// launch. See clear-local-data-on-startup.tsx.
	if (clearLocalDataState === 'blocked') {
		return <ClearLocalDataBlockedScreen />;
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
