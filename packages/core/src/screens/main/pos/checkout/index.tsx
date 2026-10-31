import * as React from 'react';

import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

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
	// A Redirect that pops: replacing stacked a second POS screen under the sheet (#3148).
	useFocusEffect(
		React.useCallback(() => {
			if (!redirectToColumns) return;
			enterCheckout(orderId);
			handSheetToColumns(router, orderId);
		}, [redirectToColumns, orderId, router])
	);
	if (redirectToColumns) return null;
	return <Checkout resource={resource} />;
}
