import * as React from 'react';
import { useNavigation, StackActions } from '@react-navigation/native';
import Modal from '@wcpos/components/src/modal';
import { t } from '@wcpos/core/src/lib/translations';
import { GatewaysProvider } from '@wcpos/core/src/contexts/gateways';
import { OrdersProvider } from '@wcpos/core/src/contexts/orders';
import { CheckoutTabs } from './checkout';

export const CheckoutModal = ({ route, navigation }) => {
	const { id } = route.params;

	return (
		<Modal
			withPortal={false}
			alwaysOpen
			title={t('Checkout')}
			size="large"
			onClose={() => navigation.dispatch(StackActions.pop(1))}
		>
			<OrdersProvider initialQuery={{ filters: { id } }}>
				<GatewaysProvider>
					<CheckoutTabs />
				</GatewaysProvider>
			</OrdersProvider>
		</Modal>
	);
};
