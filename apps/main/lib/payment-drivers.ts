import * as React from 'react';
import { Platform } from 'react-native';

import { usePaymentMethods } from '@wcpos/core/screens/main/hooks/use-payment-methods';
import { useRestHttpClient } from '@wcpos/core/screens/main/hooks/use-rest-http-client';
import { registerDriver } from '@wcpos/core/services/payment-drivers/registry';
import { createSimulatedDriver } from '@wcpos/core/services/payment-drivers/simulated-driver';

// Platform entrypoints keep the native SDK out of the web bundle.
import { createStripeTerminalDriver } from './payment-drivers/stripe-terminal';
import { StripeTerminalDriverBridge } from './payment-drivers/stripe-terminal/bridge';

if (__DEV__ || Platform.OS === 'web') registerDriver(createSimulatedDriver());

export function StripeTerminalDriverRegistration() {
	const http = useRestHttpClient();
	const { methods } = usePaymentMethods();
	const latestMethods = React.useRef(methods);
	// Update before the SDK's passive init effect; stop resolving this store after unmount.
	React.useLayoutEffect(() => {
		latestMethods.current = methods;
		return () => {
			latestMethods.current = [];
		};
	}, [methods]);
	// This REST client reads credentials fresh per request; the layout keys us by session.
	// eslint-disable-next-line react-hooks/refs -- The factory stores this callback; only SDK token requests read the ref.
	const [driver] = React.useState(() =>
		createStripeTerminalDriver({
			resolveMethodId: () =>
				latestMethods.current.find(
					(method) => method.capture.mode === 'device' && method.capture.provider === 'stripe'
				)?.id ?? null,
			bootstrap: async (methodId) => {
				const response = await http.post(`payment-methods/${methodId}/bootstrap`, {});
				return (response.data as { handoff: Record<string, unknown> }).handoff;
			},
		})
	);
	// Driver registration is owned by the mounted app, below the REST client's providers.
	React.useEffect(() => {
		registerDriver(driver);
	}, [driver]);
	const enabled = methods.some(
		(method) => method.capture.mode === 'device' && method.capture.provider === 'stripe'
	);
	return Platform.OS === 'web' || !enabled
		? null
		: React.createElement(StripeTerminalDriverBridge, { driver });
}
