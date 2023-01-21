import * as React from 'react';

import { StackActions, CommonActions } from '@react-navigation/native';
import { useReactToPrint } from 'react-to-print';

import Modal from '@wcpos/components/src/modal';

import { EmailModal } from './email';
import { Receipt } from './receipt';
import { OrdersProvider } from '../../../contexts/orders';
import useModalRefreshFix from '../../../hooks/use-modal-refresh-fix';
import { t } from '../../../lib/translations';

type POSStackParamList = import('../navigator').POSStackParamList;
type ReceiptModalProps = import('@react-navigation/stack').StackScreenProps<
	POSStackParamList,
	'Receipt'
>;

export const ReceiptModal = ({ route, navigation }: ReceiptModalProps) => {
	const { _id } = route.params;
	const [showEmailModal, setShowEmailModal] = React.useState(false);
	const receiptRef = React.useRef(null);
	const handlePrint = useReactToPrint({
		content: () => receiptRef.current,
		pageStyle: 'html, body { height: 100%; width: 100%; }',
	});
	useModalRefreshFix();

	return (
		<>
			<Modal.Container size="large">
				<Modal.Header onClose={() => navigation.dispatch(StackActions.pop(1))}>
					{t('Receipt', { _tags: 'core' })}
				</Modal.Header>
				<Modal.Content>
					<OrdersProvider initialQuery={{ filters: { _id } }}>
						<Receipt ref={receiptRef} />
					</OrdersProvider>
				</Modal.Content>
				<Modal.Footer
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
				/>
			</Modal.Container>

			<Modal
				opened={showEmailModal}
				onClose={() => {
					setShowEmailModal(false);
				}}
				title={t('Email Receipt', { _tags: 'core' })}
			>
				<EmailModal orderID={_id} />
			</Modal>
		</>
	);
};
