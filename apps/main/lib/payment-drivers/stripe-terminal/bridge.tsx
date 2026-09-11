import * as React from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';

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
	// The hook changes identity/state; bridge its current API into the non-React driver.
	React.useEffect(() => {
		latest.current = api;
		// eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-data-to-parent -- Bind an external SDK, not React parent state.
		if (initialized.current) driver.bindSdk(api);
	}, [api, driver]);
	// Own the native SDK lifecycle and listen for external foreground/user retry requests.
	React.useEffect(() => {
		mounted.current = true;
		const request = (): Promise<void> => {
			if (initialized.current || !mounted.current) return Promise.resolve();
			if (initialization.current) return initialization.current;
			if (Date.now() < retryAfter.current) return Promise.reject(failure.current);
			initialization.current = (async () => {
				if (Platform.OS === 'android') {
					const permissions = [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
					if (Number(Platform.Version) >= 31)
						permissions.push(
							PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
							PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN
						);
					const granted = await Promise.all(
						permissions.map((permission) => PermissionsAndroid.check(permission))
					);
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
		driver.setInitializationHandler(request);
		const foreground = AppState.addEventListener('change', (state) => {
			if (state === 'active') void request().catch(() => {});
		});
		void request().catch(() => {});
		return () => {
			mounted.current = false;
			foreground.remove();
			initialized.current = false;
			driver.setInitializationHandler(null);
			driver.bindSdk(null);
		};
	}, [driver]);
	// Refreshed descriptors can make bootstrap available after the first attempt failed.
	React.useEffect(() => {
		void driver.requestInitialization().catch(() => {});
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
