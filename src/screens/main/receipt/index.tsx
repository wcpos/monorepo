import * as React from 'react';

import { StackActions, CommonActions } from '@react-navigation/native';
import { useReactToPrint } from 'react-to-print';

import Modal from '@wcpos/components/src/modal';

import { EmailModal } from './email';
import { Receipt } from './receipt';
import useModalRefreshFix from '../../../hooks/use-modal-refresh-fix';
import { t } from '../../../lib/translations';
import { OrdersProvider } from '../contexts/orders';

type POSStackParamList = import('../pos').POSStackParamList;
type OrdersStackParamList = import('../orders').OrdersStackParamList;
type ReceiptModalProps = import('@react-navigation/stack').StackScreenProps<
	POSStackParamList | OrdersStackParamList,
	'Receipt'
>;

export const ReceiptModal = ({ route, navigation }: ReceiptModalProps) => {
	const { orderID } = route.params;
	const [showEmailModal, setShowEmailModal] = React.useState(false);
	const receiptRef = React.useRef(null);
	const handlePrint = useReactToPrint({
		content: () => receiptRef.current,
		pageStyle: 'html, body { height: 100%; width: 100%; }',
	});
	useModalRefreshFix();

	return (
		<>
			<Modal
				opened
				size="large"
				title={t('Receipt', { _tags: 'core' })}
				onClose={() => navigation.goBack()}
				primaryAction={{
					label: t('Print Receipt', { _tags: 'core' }),
					action: handlePrint,
				}}
				secondaryActions={[
					{
						label: t('Email Receipt', { _tags: 'core' }),
						action: () => {
							setShowEmailModal(true);
						},
					},
				]}
			>
				<OrdersProvider initialQuery={{ filters: { _id: orderID } }}>
					<Receipt ref={receiptRef} />
				</OrdersProvider>
			</Modal>

			<Modal
				opened={showEmailModal}
				onClose={() => {
					setShowEmailModal(false);
				}}
				title={t('Email Receipt', { _tags: 'core' })}
			>
				<EmailModal orderID={orderID} />
			</Modal>
		</>
	);
};

export default ReceiptModal;
