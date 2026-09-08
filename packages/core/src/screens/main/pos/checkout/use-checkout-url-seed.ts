import * as React from 'react';

import { useRouter } from 'expo-router';

import { useTheme } from '../../../../contexts/theme';
import { enterCheckout, setTenderMethod } from './checkout-mode';
import { readCheckoutSeed } from './pos-url';

/**
 * Cold-load seed: `/cart/<uuid>/checkout[/<methodId>]` re-enters checkout for that order
 * and hands the method to the store, which the tender reducer initialises from. Runs once
 * per distinct URL tuple — the route param keeps the suffix for the whole session, and a
 * tab switch must not drag the cashier back into a checkout they left.
 */
export function useCheckoutUrlSeed(orderIdParam: string | string[] | undefined) {
	const { orderId, checkout, methodId } = readCheckoutSeed(orderIdParam);
	const { screenSize } = useTheme();
	const router = useRouter();
	const lastSeed = React.useRef<string | null>(null);
	React.useEffect(() => {
		if (!checkout || !orderId) return;
		const key = `${orderId}/${methodId ?? ''}`;
		if (lastSeed.current === key) return;
		lastSeed.current = key;
		if (screenSize === 'sm') {
			// A phone opening a desktop link: the sheet route owns checkout there.
			router.replace({
				pathname: '/(app)/(drawer)/(pos)/(modals)/cart/[orderId]/checkout',
				params: { orderId },
			});
			return;
		}
		enterCheckout(orderId);
		if (methodId) setTenderMethod(orderId, methodId);
	}, [orderId, checkout, methodId, screenSize, router]);
}
