import * as React from 'react';
import { Platform } from 'react-native';

import {
	requestNeededAndroidPermissions,
	StripeTerminalProvider,
	useStripeTerminal,
} from '@stripe/stripe-terminal-react-native';

import { type createStripeTerminalDriver, tokenProvider } from './driver.native';

type Props = { driver: ReturnType<typeof createStripeTerminalDriver> };
function SdkBinding({ driver }: Props) {
	const api = useStripeTerminal(driver.callbacks);
	const latest = React.useRef(api);
	const owner = React.useRef(driver);
	const initialization = React.useRef<Promise<void> | null>(null);
	const initialized = React.useRef(false);
	// The hook changes identity/state; bridge its current API into the non-React driver.
	React.useEffect(() => {
		latest.current = api;
		// eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-data-to-parent -- Bind an external SDK, not React parent state.
		if (initialized.current) driver.bindSdk(api);
	}, [api, driver]);
	// Native permissions and initialization belong to this provider's mount, not renders.
	React.useEffect(() => {
		const mountedDriver = owner.current;
		let mounted = true;
		initialization.current ??= (async () => {
			if (Platform.OS === 'android') {
				const { error } = await requestNeededAndroidPermissions({
					accessFineLocation: {
						title: 'Connect a card reader',
						message: 'WCPOS needs location access to connect card readers and accept payments.',
						buttonPositive: 'Allow',
					},
				});
				mountedDriver.setPermissionDenied(Boolean(error));
				if (error) return;
			}
			const result = await latest.current.initialize();
			if (result.error) throw mountedDriver.reportError(result.error);
			initialized.current = true;
		})();
		void initialization.current
			.then(() => {
				if (mounted && initialized.current) mountedDriver.bindSdk(latest.current);
			})
			.catch((error: Error) => {
				if (mounted)
					mountedDriver.reportError({ code: 'InitializationError', message: error.message });
			});
		return () => {
			mounted = false;
			mountedDriver.bindSdk(null);
		};
	}, []);
	return null;
}
export function StripeTerminalDriverBridge({ driver }: Props) {
	return (
		<StripeTerminalProvider tokenProvider={tokenProvider} logLevel={__DEV__ ? 'verbose' : 'error'}>
			<SdkBinding driver={driver} />
		</StripeTerminalProvider>
	);
}
