import * as React from 'react';

import { useObservableState, useObservableSuspense, ObservableResource } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Loader from '@wcpos/components/src/loader';
import { useModal } from '@wcpos/components/src/modal';

import PaymentWebview from './components/payment-webview';
import CheckoutTitle from './components/title';
import { t } from '../../../../lib/translations';
import usePushDocument from '../../contexts/use-push-document';

interface Props {
	resource: ObservableResource<import('@wcpos/database').OrderDocument>;
}

/**
 *
 */
const Checkout = ({ resource }: Props) => {
	const order = useObservableSuspense(resource);
	const pushDocument = usePushDocument();
	const [isPushed, setIsPushed] = React.useState(false);

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
	React.useEffect(() => {
		if (!isPushed) {
			// Wrap the async function in an IIFE (Immediately Invoked Function Expression)
			(async () => {
				try {
					const result = await pushDocument(order);
					setIsPushed(true);
				} catch (error) {
					console.error('Error pushing document:', error);
				}
			})();
		}
	}, [isPushed, order, pushDocument]);

	/**
	 *
	 */
	return (
		<Box fill space="small">
			<CheckoutTitle order={order} />
			{isPushed ? <PaymentWebview order={order} /> : <Loader />}
		</Box>
	);
};

export default Checkout;
