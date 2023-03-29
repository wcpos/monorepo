import * as React from 'react';

import { useObservableState, ObservableResource } from 'observable-hooks';
import { from } from 'rxjs';
import { tap } from 'rxjs/operators';

import Box from '@wcpos/components/src/box';
import { useModal } from '@wcpos/components/src/modal';

import PaymentWebview from './components/payment-webview';
import CheckoutTitle from './components/title';
import { t } from '../../../../lib/translations';
import useOrders from '../../contexts/orders';
import usePushDocument from '../../contexts/use-push-document';

/**
 *
 */
const Checkout = () => {
	const { data } = useOrders();
	const order = data.length === 1 && data[0];
	const pushDocument = usePushDocument();

	if (!order) {
		throw new Error(t('Order not found', { _tags: 'core' }));
	}

	const number = useObservableState(order.number$, order.number);
	const { setTitle } = useModal();

	/**
	 * Update title with order number
	 */
	React.useEffect(() => {
		let title = t('Checkout', { _tags: 'core' });
		if (number) {
			title = t('Checkout Order #{number}', {
				_tags: 'core',
				number,
				_context: 'Checkout Order title',
			});
		}
		setTitle(() => title);
	}, [number, setTitle]);

	/**
	 * This is a bit of a hack to suspend the webview until the order is saved
	 *
	 */
	const orderResource = React.useMemo(
		() => new ObservableResource(from(pushDocument(order))),
		// I can't put order in the deps array because it will cause an infinite loop
		[pushDocument]
	);

	/**
	 *
	 */
	return (
		<Box fill space="small">
			<CheckoutTitle order={order} />
			<React.Suspense>
				<PaymentWebview orderResource={orderResource} />
			</React.Suspense>
		</Box>
	);
};

export default Checkout;
