import { AppState, type Permission, PermissionsAndroid, Platform } from 'react-native';
import * as React from 'react';

import {
	requestNeededAndroidPermissions,
	StripeTerminalProvider,
	useStripeTerminal,
} from '@stripe/stripe-terminal-react-native';

import type { PaymentMethodDescriptor } from '@wcpos/order-math';

import { type createStripeTerminalDriver, tokenProvider } from './driver';

// Failed startup must be retryable without hammering the store's token endpoint.
const INITIALIZATION_RETRY_MS = 15000;
type Props = {
	driver: ReturnType<typeof createStripeTerminalDriver>;
	methods?: readonly PaymentMethodDescriptor[];
};
function SdkBinding({ driver, methods }: Props) {
	const api = useStripeTerminal(driver.callbacks);
	const latest = React.useRef(api);
	const initialized = React.useRef(false);
	const initialization = React.useRef<Promise<void> | null>(null);
	const retryAfter = React.useRef(0);
	const failure = React.useRef<Error | null>(null);
	const mounted = React.useRef(false);
	// Launch, foreground and descriptor refreshes initialize WITHOUT prompting; the
	// initialization handler (every reader operation) may prompt. See `request` below.
	const quiet = React.useRef<() => Promise<void>>(() => Promise.resolve());
	// The hook changes identity/state; bridge its current API into the non-React driver.
	React.useEffect(() => {
		latest.current = api;
		// eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-data-to-parent -- Bind an external SDK, not React parent state.
		if (initialized.current) driver.bindSdk(api);
	}, [api, driver]);
	// Own the native SDK lifecycle and listen for external foreground/user retry requests.
	React.useEffect(() => {
		mounted.current = true;
		// `prompt: false` initializes only when that cannot open a permission dialog: iOS
		// always; Android once location + Bluetooth are already granted. The Android SDK
		// refuses to initialize before they are, and an eager prompt turned every launch of
		// a store with Stripe Terminal enabled into a location dialog (2026-10-05). A till
		// that has taken a card payment has granted them, so it still initializes at launch
		// — which is what forwards its stored offline payments without a cashier action.
		// On a till that never has, the first reader operation prompts (`prompt: true`).
		const request = (prompt: boolean): Promise<void> => {
			if (initialized.current || !mounted.current) return Promise.resolve();
			if (initialization.current) return initialization.current;
			if (Date.now() < retryAfter.current) return Promise.reject(failure.current);
			initialization.current = (async () => {
				if (Platform.OS === 'android') {
					const permissions: Permission[] = [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
					if (Number(Platform.Version) >= 31)
						permissions.push(
							PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
							PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN
						);
					const granted = await Promise.all(
						permissions.map((permission) => PermissionsAndroid.check(permission))
					);
					if (!granted.every(Boolean) && !prompt) return;
					const { error } = granted.every(Boolean)
						? { error: null }
						: await requestNeededAndroidPermissions({
								accessFineLocation: {
									title: 'Connect a card reader',
									message:
										'WCPOS needs location access to connect card readers and accept payments.',
									buttonPositive: 'Allow',
								},
							});
					if (!mounted.current) return;
					driver.setPermissionDenied(Boolean(error));
					if (error) throw new Error('Allow card reader permissions in app settings');
				}
				if (!mounted.current) return;
				const result = await latest.current.initialize();
				if (result.error) throw new Error(result.error.message);
				if (mounted.current) {
					initialized.current = true;
					driver.bindSdk(latest.current);
				}
			})()
				.catch((error: unknown) => {
					failure.current = error instanceof Error ? error : new Error(String(error));
					retryAfter.current = Date.now() + INITIALIZATION_RETRY_MS;
					if (mounted.current)
						driver.reportError({ code: 'InitializationError', message: failure.current.message });
					throw failure.current;
				})
				.finally(() => {
					initialization.current = null;
				});
			return initialization.current;
		};
		quiet.current = () => request(false);
		driver.setInitializationHandler(async () => {
			await request(true);
			// A prompting call that joined an in-flight quiet one resolves without the SDK
			// when a permission was missing; ask once more rather than let ready() time out.
			if (!initialized.current && mounted.current) await request(true);
		});
		const foreground = AppState.addEventListener('change', (state) => {
			if (state === 'active') void request(false).catch(() => {});
		});
		return () => {
			mounted.current = false;
			foreground.remove();
			initialized.current = false;
			quiet.current = () => Promise.resolve();
			driver.setInitializationHandler(null);
			driver.bindSdk(null);
			// A refusal belongs to this mount's prompt; the next mount's first operation
			// asks again rather than inheriting a disabled payment tile.
			driver.setPermissionDenied(false);
		};
	}, [driver]);
	// Runs at mount (the launch-time init) and when refreshed descriptors can make bootstrap
	// available after the first attempt failed. Declared after the lifecycle effect so
	// `quiet` is set when it runs.
	React.useEffect(() => {
		void quiet.current().catch(() => {});
	}, [driver, methods]);
	return null;
}
export function StripeTerminalDriverBridge({ driver, methods }: Props) {
	return (
		<StripeTerminalProvider tokenProvider={tokenProvider} logLevel={__DEV__ ? 'verbose' : 'error'}>
			<SdkBinding driver={driver} methods={methods} />
		</StripeTerminalProvider>
	);
}
