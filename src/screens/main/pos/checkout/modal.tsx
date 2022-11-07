import * as React from 'react';
import { StackActions, CommonActions } from '@react-navigation/native';
import Modal from '@wcpos/components/src/modal';
import { t } from '@wcpos/core/src/lib/translations';
import { GatewaysProvider } from '@wcpos/core/src/contexts/gateways';
import { OrdersProvider } from '@wcpos/core/src/contexts/orders';
import { CheckoutTabs } from './checkout';

type POSStackParamList = import('../navigator').POSStackParamList;
type CheckoutModalProps = import('@react-navigation/stack').StackScreenProps<
	POSStackParamList,
	'Checkout'
>;

export const CheckoutModal = ({ route, navigation }: CheckoutModalProps) => {
	const { _id } = route.params;
	const checkoutRef = React.useRef(null);

	React.useEffect(() => {
		if (!navigation.canGoBack()) {
			/**
			 * @TODO - this doesn't do anything, how to render the POS on deep link access?
			 */
			navigation.dispatch(
				CommonActions.reset({
					index: 1,
					routes: [
						{ name: 'Columns' },
						{
							name: 'Checkout',
							params: { _id },
						},
					],
				})
			);
			console.log(navigation.getState());
		}
	}, [_id, navigation]);

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
