import * as React from 'react';

import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';

import { useEngineRecord } from '@wcpos/query/record-readers';
import { useIsPhone } from '@wcpos/components/lib/device';

import { useFirstAnswer } from '../../hooks/use-first-answer';
import { usePaymentMethods } from '../../hooks/use-payment-methods';
import { enterCheckout } from './checkout-mode';
import { Checkout } from './checkout';
import {
	columnsCheckoutHref,
	leaveSheet,
	routeBeneath,
	STANDALONE_CHECKOUT_PARAM,
	tillCartHref,
} from './till-route';
import { bouncesToCart } from './use-checkout-url-seed';

export function CheckoutScreen() {
	const router = useRouter();
	const navigation = useNavigation();
	const params = useLocalSearchParams<{
		orderId: string;
		[STANDALONE_CHECKOUT_PARAM]?: string;
	}>();
	const { orderId } = params;
	const resource = useEngineRecord('orders', orderId);
	const answered = useFirstAnswer(resource);
	// Decided once, at the first answer (null until then): Pay clears its save state as it settles.
	const bounce = React.useMemo(() => {
		if (!answered) return null;
		// Failed or completed empty: the reader mounts, and its `read()` rethrows into its boundary.
		if (resource.valueRef$$.value === undefined) return false;
		return bouncesToCart(resource.valueRef$$.value?.current?.payload.id, orderId);
	}, [answered, resource, orderId]);

	const phone = useIsPhone();
	const { loaded, unsupportedSchema } = usePaymentMethods();
	// A standalone link names an order that may not be an open cart; the columns cart could
	// not resolve it, so the order's own checkout opens instead.
	const standalone = params[STANDALONE_CHECKOUT_PARAM] === '1';
	const redirectToColumns = !phone && loaded && !unsupportedSchema && !standalone;
	// A Redirect that pops: replacing stacked a second POS screen under the sheet (#3148).
	useFocusEffect(
		React.useCallback(() => {
			const beneath = routeBeneath(navigation.getState());
			if (bounce) leaveSheet(router, tillCartHref(phone, orderId), beneath);
			if (bounce !== false || !redirectToColumns) return;
			enterCheckout(orderId);
			leaveSheet(router, columnsCheckoutHref(orderId), beneath);
		}, [bounce, phone, redirectToColumns, orderId, router, navigation])
	);
	if (bounce !== false || redirectToColumns) return null;
	return <Checkout resource={resource} />;
}
