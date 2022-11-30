import * as React from 'react';

import { StackActions, CommonActions } from '@react-navigation/native';
import { useTheme } from 'styled-components/native';

import Modal from '@wcpos/components/src/modal';
import log from '@wcpos/utils/src/logger';

import { GatewaysProvider } from '../../../../contexts/gateways';
import { OrdersProvider } from '../../../../contexts/orders';
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
	const theme = useTheme();

	/**
	 * If checkout is the only one in stack (ie: page refresh),
	 * then reset navigation with a sensible stack
	 * @TODO - is there a better way to do this?
	 */
	React.useEffect(() => {
		if (!navigation.canGoBack()) {
			navigation.dispatch(
				CommonActions.reset({
					index: 1,
					routes: [
						{ name: theme._dimensions.width >= theme.screens.small ? 'Columns' : 'Tabs' },
						{
							name: 'Checkout',
							params: { _id },
						},
					],
				})
			);
		}
	}, [_id, navigation, theme._dimensions.width, theme.screens.small]);

	return (
		<Modal
			withPortal={false}
			alwaysOpen
			title={t('Checkout')}
			size="large"
			onClose={() => navigation.dispatch(StackActions.pop(1))}
			primaryAction={{
				label: t('Process Payment'),
				action: () => {
					if (checkoutRef) {
						checkoutRef.current.processPayment();
					}
				},
			}}
		>
			<OrdersProvider initialQuery={{ filters: { _id } }}>
				<GatewaysProvider>
					<CheckoutTabs ref={checkoutRef} />
				</GatewaysProvider>
			</OrdersProvider>
		</Modal>
	);
};
