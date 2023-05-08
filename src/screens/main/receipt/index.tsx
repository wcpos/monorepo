import * as React from 'react';
import { View } from 'react-native';

import { useObservableState, useObservableSuspense } from 'observable-hooks';

import { useModal } from '@wcpos/components/src/modal';

import { EmailModal } from './components/email';
import { ReceiptTemplate } from './components/template-webview';
import { t } from '../../../lib/translations';
import useOrders from '../contexts/orders';

export const ReceiptModal = () => {
	const { resource } = useOrders();
	const data = useObservableSuspense(resource);
	const order = data.length === 1 && data[0];

	if (!order) {
		throw new Error(t('Order not found', { _tags: 'core' }));
	}

	const [showEmailModal, setShowEmailModal] = React.useState(false);
	const { setSecondaryActions } = useModal();
	const id = useObservableState(order.id$, order.id);
	const billingEmail = useObservableState(order.billing.email$, order.billing.email);

	/**
	 *
	 */
	setSecondaryActions((prev) =>
		prev.map((p, index) => {
			if (index === 0) {
				return {
					...p,
					action: () => setShowEmailModal(true),
				};
			} else {
				return p;
			}
		})
	);

	/**
	 *
	 */
	return (
		<View style={{ height: '100%' }}>
			<ReceiptTemplate order={order} />
			{showEmailModal && (
				<EmailModal defaultEmail={billingEmail} id={id} setShowEmailModal={setShowEmailModal} />
			)}
		</View>
	);
};

export default ReceiptModal;
