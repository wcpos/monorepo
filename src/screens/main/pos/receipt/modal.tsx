import * as React from 'react';

import { StackActions } from '@react-navigation/native';

import Modal from '@wcpos/components/src/modal';

import { OrdersProvider } from '../../../../contexts/orders';
import { t } from '../../../../lib/translations';
import { Receipt } from './receipt';

type POSStackParamList = import('../navigator').POSStackParamList;
type ReceiptModalProps = import('@react-navigation/stack').StackScreenProps<
	POSStackParamList,
	'Receipt'
>;

export const ReceiptModal = ({ route, navigation }: ReceiptModalProps) => {
	const { _id } = route.params;

	return (
		<Modal
			withPortal={false}
			alwaysOpen
			title={t('Receipt')}
			size="large"
			onClose={() => navigation.dispatch(StackActions.pop(1))}
		>
			<OrdersProvider initialQuery={{ filters: { _id } }}>
				<Receipt />
			</OrdersProvider>
		</Modal>
	);
};
