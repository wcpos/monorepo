import * as React from 'react';
import { View } from 'react-native';

import { useObservableState, useObservableSuspense, ObservableResource } from 'observable-hooks';

import { useModal } from '@wcpos/components/src/modal';

import { EmailModal } from './components/email';
import { ReceiptTemplate } from './components/template-webview';
import { useT } from '../../../contexts/translations';

interface Props {
	resource: ObservableResource<import('@wcpos/database').OrderDocument>;
}

/**
 *
 */
export const ReceiptModal = ({ resource }: Props) => {
	const order = useObservableSuspense(resource);
	const t = useT();

	if (!order) {
		throw new Error(t('Order not found', { _tags: 'core' }));
	}

	const [showEmailModal, setShowEmailModal] = React.useState(false);
	const { setSecondaryActions } = useModal();
	const id = useObservableState(order.id$, order.id);
	const billingEmail = useObservableState(order.billing.email$, order.billing.email);

	/**
	 * @TODO - I need to fix this mess with Modal actions
	 */
	setSecondaryActions((prev) => {
		if (typeof prev === 'function') {
			return;
		}
		return prev.map((p, index) => {
			if (index === 0) {
				return {
					...p,
					action: () => setShowEmailModal(true),
				};
			} else {
				return p;
			}
		});
	});

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
