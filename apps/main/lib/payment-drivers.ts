import * as React from 'react';
import { Platform } from 'react-native';

import { usePaymentMethods } from '@wcpos/core/screens/main/hooks/use-payment-methods';
import { useRestHttpClient } from '@wcpos/core/screens/main/hooks/use-rest-http-client';
import { registerDriver } from '@wcpos/core/services/payment-drivers/registry';
import { createSimulatedDriver } from '@wcpos/core/services/payment-drivers/simulated-driver';
import type { PaymentMethodDescriptor } from '@wcpos/order-math';

// Platform entrypoints keep the native SDK out of the web bundle.
import { createStripeTerminalDriver } from './payment-drivers/stripe-terminal';
import { StripeTerminalDriverBridge } from './payment-drivers/stripe-terminal/bridge';

if (__DEV__ || Platform.OS === 'web') registerDriver(createSimulatedDriver());

type Http = ReturnType<typeof useRestHttpClient>;
type StripeDriver = ReturnType<typeof createStripeTerminalDriver>;

// The SDK's token provider may ask for a token at any time (init, reconnect), so the driver
// reads the current store through these holders. The registration component keeps them
// current from effects — never from render — so nothing here touches a ref during render.
let currentMethods: readonly PaymentMethodDescriptor[] = [];
let currentHttp: Http | null = null;

function stripeDeviceMethodId(methods: readonly PaymentMethodDescriptor[]): string | null {
	return (
		methods.find(
			(method) => method.capture.mode === 'device' && method.capture.provider === 'stripe'
		)?.id ?? null
	);
}

function createDriver(): StripeDriver {
	return createStripeTerminalDriver({
		resolveMethodId: () => stripeDeviceMethodId(currentMethods),
		bootstrap: async (methodId) => {
			if (!currentHttp) throw new Error('Stripe Terminal has no store connection');
			const response = await currentHttp.post(`payment-methods/${methodId}/bootstrap`, {});
			return (response.data as { handoff: Record<string, unknown> }).handoff;
		},
	});
}

export function StripeTerminalDriverRegistration() {
	const http = useRestHttpClient();
	const { methods } = usePaymentMethods();
	// One driver per mounted app. The initializer reads no React state or refs: the driver
	// resolves the store through the module holders above at call time.
	const [driver] = React.useState<StripeDriver>(createDriver);
	// Update before the SDK's passive init effect; stop resolving this store after unmount.
	React.useLayoutEffect(() => {
		currentMethods = methods;
		currentHttp = http;
		return () => {
			currentMethods = [];
			currentHttp = null;
		};
	}, [methods, http]);
	// Driver registration is owned by the mounted app, below the REST client's providers.
	React.useEffect(() => {
		registerDriver(driver);
	}, [driver]);
	const enabled = stripeDeviceMethodId(methods) !== null;
	return Platform.OS === 'web' || !enabled
		? null
		: React.createElement(StripeTerminalDriverBridge, { driver });
}
