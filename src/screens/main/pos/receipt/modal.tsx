import * as React from 'react';
import { StackActions } from '@react-navigation/native';
import Modal from '@wcpos/components/src/modal';
import { t } from '@wcpos/core/src/lib/translations';
import { OrdersProvider } from '@wcpos/core/src/contexts/orders';
import { Receipt } from './receipt';

type POSStackParamList = import('../navigator').POSStackParamList;
type CheckoutModalProps = import('@react-navigation/stack').StackScreenProps<
	POSStackParamList,
	'Checkout'
>;

export const ReceiptModal = ({ route, navigation }: CheckoutModalProps) => {
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
