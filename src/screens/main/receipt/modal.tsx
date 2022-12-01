import * as React from 'react';

import { StackActions, CommonActions } from '@react-navigation/native';
import { useReactToPrint } from 'react-to-print';

import Modal from '@wcpos/components/src/modal';

import { OrdersProvider } from '../../../contexts/orders';
import useModalRefreshFix from '../../../hooks/use-modal-refresh-fix';
import { t } from '../../../lib/translations';
import { EmailModal } from './email';
import { Receipt } from './receipt';

type POSStackParamList = import('../navigator').POSStackParamList;
type ReceiptModalProps = import('@react-navigation/stack').StackScreenProps<
	POSStackParamList,
	'Receipt'
>;

export const ReceiptModal = ({ route, navigation }: ReceiptModalProps) => {
	const { _id } = route.params;
	const [showEmailModal, seShowEmailModal] = React.useState(false);
	const receiptRef = React.useRef(null);
	const handlePrint = useReactToPrint({
		content: () => receiptRef.current,
		pageStyle: 'html, body { height: 100%; width: 100%; }',
	});
	useModalRefreshFix();

	/**
	 * If checkout is the only one in stack (ie: page refresh),
	 * then reset navigation with a sensible stack
	 * @TODO - is there a better way to do this?
	 *
	 * @TODO - move to useModalRefreshFix with screen size dependency
	 */
	// React.useEffect(() => {
	// 	const state = navigation.getState();
	// 	if (state.routes.length === 1) {
	// 		navigation.dispatch(
	// 			CommonActions.reset({
	// 				index: 1,
	// 				routes: [
	// 					{ name: state.routeNames[0] },
	// 					{
	// 						name: 'Receipt',
	// 						params: { _id },
	// 					},
	// 				],
	// 			})
	// 		);
	// 	}
	// }, [_id, navigation]);

	return (
		<Modal
			withPortal={false}
			alwaysOpen
			title={t('Receipt')}
			size="large"
			onClose={() => navigation.dispatch(StackActions.pop(1))}
			style={{ height: '100%' }}
			primaryAction={{
				label: t('Print Receipt'),
				action: handlePrint,
			}}
			secondaryActions={[
				{
					label: t('Email Receipt'),
					action: () => {
						seShowEmailModal(true);
					},
				},
			]}
		>
			<OrdersProvider initialQuery={{ filters: { _id } }}>
				<Receipt ref={receiptRef} />
				{showEmailModal && (
					<EmailModal
						orderID={_id}
						onClose={() => {
							seShowEmailModal(false);
						}}
					/>
				)}
			</OrdersProvider>
		</Modal>
	);
};
