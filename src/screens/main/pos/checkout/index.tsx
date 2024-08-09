import * as React from 'react';

import { useObservableState, useObservableSuspense, ObservableResource } from 'observable-hooks';

import { VStack } from '@wcpos/tailwind/src/vstack';

import PaymentWebview from './components/payment-webview';
import CheckoutTitle from './components/title';
import { useT } from '../../../../contexts/translations';

interface Props {
	resource: ObservableResource<import('@wcpos/database').OrderDocument>;
}

/**
 *
 */
const Checkout = ({ resource }: Props) => {
	const order = useObservableSuspense(resource);
	const t = useT();

	if (!order) {
		throw new Error(t('Order not found', { _tags: 'core' }));
	}

	const number = useObservableState(order.number$, order.number);
	// const { setTitle } = useModal();

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
		// setTitle(() => title);
	}, [number, setTitle, t]);

	/**
	 *
	 */
	return (
		<VStack>
			<CheckoutTitle order={order} />
			<PaymentWebview order={order} />
		</VStack>
	);
};

export default Checkout;
