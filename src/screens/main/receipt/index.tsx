import * as React from 'react';
import { View } from 'react-native';

import { useObservableState } from 'observable-hooks';

import Modal, { useModal } from '@wcpos/components/src/modal';

import { EmailModal } from './components/email';
import { ReceiptTemplate } from './components/template-webview';
import { t } from '../../../lib/translations';
import useOrders from '../contexts/orders';
import useRestHttpClient from '../hooks/use-rest-http-client';

export const ReceiptModal = () => {
	const { data } = useOrders();
	const order = data.length === 1 && data[0];

	if (!order) {
		throw new Error(t('Order not found', { _tags: 'core' }));
	}

	const [showEmailModal, setShowEmailModal] = React.useState(false);
	const { onSecondaryAction } = useModal();
	const id = useObservableState(order.id$, order.id);
	const http = useRestHttpClient();
	const emailFieldRef = React.useRef('');
	const saveCheckboxRef = React.useRef(false);

	/**
	 *
	 */
	onSecondaryAction(() => setShowEmailModal(true));

	/**
	 *
	 */
	const sendEmail = React.useCallback(async () => {
		try {
			const { success } = await http.post(`/orders/${id}/email`, {
				data: {
					email: emailFieldRef.current.value,
					save_to: saveCheckboxRef.current.value ? 'billing' : '',
				},
			});
			if (success) {
				// refresh order because it might have email added to it
			}
		} catch (error) {
			console.log(error);
		}
	}, [http, id]);

	/**
	 *
	 */
	return (
		<View style={{ height: '100%' }}>
			<ReceiptTemplate order={order} />

			<Modal
				opened={showEmailModal}
				onClose={() => {
					setShowEmailModal(false);
				}}
				title={t('Email Receipt', { _tags: 'core' })}
				primaryAction={{
					label: t('Send', { _tags: 'core' }),
					action: sendEmail,
				}}
			>
				<EmailModal emailFieldRef={emailFieldRef} saveCheckboxRef={saveCheckboxRef} />
			</Modal>
		</View>
	);
};

export default ReceiptModal;
