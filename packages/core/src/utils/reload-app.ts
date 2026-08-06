import { NativeModules, Platform } from 'react-native';

/**
 * Reload the whole app.
 *
 * This is the only recovery from a lost RxDB storage worker (#163): the adapter
 * builds ONE module-scope worker storage for the app, so nothing short of a
 * fresh page/bundle replaces the worker that died. Mirrors the reload used by
 * the root error boundary (`apps/main/components/root-error.tsx`).
 */
export function reloadApp(): boolean {
	if (Platform.OS === 'web') {
		window.location.reload();
		return true;
	}

	// Native: DevSettings.reload() works in dev/debug builds. Production native
	// builds would need expo-updates, which is not installed — so report the
	// failure instead of pretending, and let the caller tell the cashier to close
	// and reopen the app by hand.
	if (typeof NativeModules.DevSettings?.reload !== 'function') {
		return false;
	}

	NativeModules.DevSettings.reload();
	return true;
}
