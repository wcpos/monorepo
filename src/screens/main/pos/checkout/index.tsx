import * as React from 'react';

import { useObservableState, useObservableSuspense, ObservableResource } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import { useModal } from '@wcpos/components/src/modal';

import PaymentWebview from './components/payment-webview';
import CheckoutTitle from './components/title';
import { t } from '../../../../lib/translations';

interface Props {
	resource: ObservableResource<import('@wcpos/database').OrderDocument>;
}

/**
 *
 */
const Checkout = ({ resource }: Props) => {
	const order = useObservableSuspense(resource);

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
	 *
	 */
	return (
		<Box fill space="small">
			<CheckoutTitle order={order} />
			<PaymentWebview order={order} />
		</Box>
	);
};

export default Checkout;
