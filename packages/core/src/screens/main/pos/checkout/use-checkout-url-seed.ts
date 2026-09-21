import * as React from 'react';

import { useRouter } from 'expo-router';

import { useTheme } from '../../../../contexts/theme';
import { usePaymentMethods } from '../../hooks/use-payment-methods';
import { enterCheckout, setTenderMethod } from './checkout-mode';
import { readCheckoutSeed } from './pos-url';

/**
 * Cold-load seed: `/cart/<uuid>/checkout[/<methodId>]` re-enters checkout for that order
 * and hands the method to the store, which the tender reducer initialises from. Runs once
 * per distinct URL tuple — the route param keeps the suffix for the whole session, and a
 * tab switch must not drag the cashier back into a checkout they left.
 *
 * Same gate as Pay and `CheckoutScreen`: a store without the payment-methods contract keeps
 * its legacy modal, so the link is routed there instead of into an unusable tender column.
 */
export function useCheckoutUrlSeed(orderIdParam: string | string[] | undefined) {
	const { orderId, checkout, methodId } = readCheckoutSeed(orderIdParam);
	const { screenSize } = useTheme();
	const { loaded, unsupportedSchema } = usePaymentMethods();
	const router = useRouter();
	const lastSeed = React.useRef<string | null>(null);
	React.useEffect(() => {
		if (!checkout || !orderId || !loaded) return;
		const key = `${orderId}/${methodId ?? ''}`;
		if (lastSeed.current === key) return;
		lastSeed.current = key;
		if (!unsupportedSchema) {
			enterCheckout(orderId);
			if (methodId) setTenderMethod(orderId, methodId);
		}
		if (screenSize === 'sm' || unsupportedSchema) {
			// The sheet (phones) or the legacy modal (no contract) is a route of its own.
			router.replace({
				pathname: '/(app)/(drawer)/(pos)/(modals)/cart/[orderId]/checkout',
				params: { orderId },
			});
		}
	}, [orderId, checkout, methodId, screenSize, loaded, unsupportedSchema, router]);
}
