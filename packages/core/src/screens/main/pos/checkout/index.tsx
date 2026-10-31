import * as React from 'react';

import { useLocalSearchParams, useRouter } from 'expo-router';

import { useEngineRecord } from '@wcpos/query/record-readers';
import { useIsPhone } from '@wcpos/components/lib/device';

import { usePaymentMethods } from '../../hooks/use-payment-methods';
import { enterCheckout } from './checkout-mode';
import { Checkout } from './checkout';
import { handSheetToColumns, STANDALONE_CHECKOUT_PARAM } from './till-route';

export function CheckoutScreen() {
	const router = useRouter();
	const params = useLocalSearchParams<{
		orderId: string;
		[STANDALONE_CHECKOUT_PARAM]?: string;
	}>();
	const { orderId } = params;
	const resource = useEngineRecord('orders', orderId);

	const phone = useIsPhone();
	const { loaded, unsupportedSchema } = usePaymentMethods();
	// A standalone link names an order that may not be an open cart; the columns cart could
	// not resolve it, so the order's own checkout opens instead.
	const standalone = params[STANDALONE_CHECKOUT_PARAM] === '1';
	const redirectToColumns = !phone && loaded && !unsupportedSchema && !standalone;
	// Writing the external store during render would notify its subscribers mid-render; the
	// checkout store write and navigation both belong in this effect.
	React.useEffect(() => {
		if (!redirectToColumns) return;
		enterCheckout(orderId);
		handSheetToColumns(router, orderId);
	}, [redirectToColumns, orderId, router]);
	if (redirectToColumns) return null;
	return <Checkout resource={resource} />;
}
