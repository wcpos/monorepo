import * as React from 'react';

import { StackActions } from '@react-navigation/native';

import Modal from '@wcpos/components/src/modal';
import log from '@wcpos/utils/src/logger';

import { CheckoutTabs } from './checkout';
import { GatewaysProvider } from '../../../../contexts/gateways';
import { OrdersProvider } from '../../../../contexts/orders';
import useModalRefreshFix from '../../../../hooks/use-modal-refresh-fix';
import { t } from '../../../../lib/translations';

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
		<Modal.Container size="large">
			<Modal.Header onClose={() => navigation.dispatch(StackActions.pop(1))}>
				{t('Checkout', { _tags: 'core' })}
			</Modal.Header>
			<Modal.Content>
				<OrdersProvider initialQuery={{ filters: { _id } }}>
					<GatewaysProvider initialQuery={{ filters: { enabled: true } }}>
						<CheckoutTabs ref={checkoutRef} />
					</GatewaysProvider>
				</OrdersProvider>
			</Modal.Content>
			<Modal.Footer
				primaryAction={{
					label: t('Process Payment', { _tags: 'core' }),
					action: () => {
						if (checkoutRef) {
							checkoutRef.current.processPayment();
						}
					},
				}}
			/>
		</Modal.Container>
	);
};
