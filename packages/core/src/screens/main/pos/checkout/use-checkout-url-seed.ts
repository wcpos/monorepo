import * as React from 'react';

import { useRouter } from 'expo-router';

import { useTheme } from '../../../../contexts/theme';
import { seedCheckoutFromUrl } from './checkout-mode';
import { readCheckoutSeed } from './pos-url';

export function useCheckoutUrlSeed(orderIdParam: string | string[] | undefined) {
	const { orderId, checkout, methodId } = readCheckoutSeed(orderIdParam);
	const { screenSize } = useTheme();
	const router = useRouter();
	const seeded = React.useRef(new Set<string>());
	// Seed the external store/router once per URL tuple, not again on tab echoes.
	React.useEffect(() => {
		if (!checkout || !orderId) return;
		const key = JSON.stringify([orderId, checkout, methodId]);
		if (seeded.current.has(key)) return;
		seeded.current.add(key);
		if (screenSize !== 'sm') seedCheckoutFromUrl(orderId, methodId);
		else
			router.replace({
				pathname: '/(app)/(drawer)/(pos)/(modals)/cart/[orderId]/checkout',
				params: { orderId },
			});
	}, [orderId, checkout, methodId, screenSize, router]);
}
