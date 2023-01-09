import * as React from 'react';

import { StackActions } from '@react-navigation/native';

import Modal from '@wcpos/components/src/modal';
import log from '@wcpos/utils/src/logger';

import { GatewaysProvider } from '../../../../contexts/gateways';
import { OrdersProvider } from '../../../../contexts/orders';
import useModalRefreshFix from '../../../../hooks/use-modal-refresh-fix';
import { t } from '../../../../lib/translations';
import { CheckoutTabs } from './checkout';

type POSStackParamList = import('../navigator').POSStackParamList;
type CheckoutModalProps = import('@react-navigation/stack').StackScreenProps<
	POSStackParamList,
	'Checkout'
>;

export const CheckoutModal = ({ route, navigation }: CheckoutModalProps) => {
	const { _id } = route.params;
	const checkoutRef = React.useRef(null);
	useModalRefreshFix();

	return (
		<Modal
			withPortal={false}
			alwaysOpen
			title={t('Checkout', { _tags: 'core' })}
			size="large"
			onClose={() => navigation.dispatch(StackActions.pop(1))}
			primaryAction={{
				label: t('Process Payment', { _tags: 'core' }),
				action: () => {
					if (checkoutRef) {
						checkoutRef.current.processPayment();
					}
				},
			}}
		>
			<OrdersProvider initialQuery={{ filters: { _id } }}>
				<GatewaysProvider initialQuery={{ filters: { enabled: true } }}>
					<CheckoutTabs ref={checkoutRef} />
				</GatewaysProvider>
			</OrdersProvider>
		</Modal>
	);
};
