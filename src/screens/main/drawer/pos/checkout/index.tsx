import * as React from 'react';

import Box from '@wcpos/components/src/box';
import Modal from '@wcpos/components/src/modal';

import GatewayTabs from './components/gateway-tabs';
import CheckoutTitle from './components/title';
import { GatewaysProvider } from '../../../../../contexts/gateways';
import { OrdersProvider } from '../../../../../contexts/orders';
import useModalRefreshFix from '../../../../../hooks/use-modal-refresh-fix';
import { t } from '../../../../../lib/translations';

type POSStackParamList = import('../_navigator').POSStackParamList;
type CheckoutModalProps = import('@react-navigation/stack').StackScreenProps<
	POSStackParamList,
	'Checkout'
>;

const Checkout = ({ navigation, route }: CheckoutModalProps) => {
	const { orderID } = route.params;
	useModalRefreshFix();

	return (
		<OrdersProvider initialQuery={{ filters: { localID: orderID } }}>
			<GatewaysProvider initialQuery={{ filters: { enabled: true } }}>
				<Modal
					opened
					onClose={() => navigation.goBack()}
					withPortal={false}
					size="large"
					title={t('Checkout', { _tags: 'core' })}
					primaryAction={{
						label: t('Process Payment', { _tags: 'core' }),
						action: () => {
							// if (checkoutRef) {
							// 	checkoutRef.current.processPayment();
							// }
						},
					}}
				>
					<Box space="medium">
						<CheckoutTitle />
						<GatewayTabs />
					</Box>
				</Modal>
			</GatewaysProvider>
		</OrdersProvider>
	);
};

export default Checkout;
