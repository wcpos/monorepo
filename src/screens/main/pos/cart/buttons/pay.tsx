import * as React from 'react';

import { useNavigation, StackActions } from '@react-navigation/native';
import { useObservableEagerState } from 'observable-hooks';
import { isRxDocument } from 'rxdb';

import { Button } from '@wcpos/components/src/button';
import { Toast } from '@wcpos/components/src/toast';

import { useT } from '../../../../../contexts/translations';
import usePushDocument from '../../../contexts/use-push-document';
import { useCurrentOrderCurrencyFormat } from '../../../hooks/use-current-order-currency-format';
import { useCurrentOrder } from '../../contexts/current-order';

/**
 *
 */
export const PayButton = () => {
	const { currentOrder } = useCurrentOrder();
	const total = useObservableEagerState(currentOrder.total$);
	const { format } = useCurrentOrderCurrencyFormat();
	const navigation = useNavigation();
	const [loading, setLoading] = React.useState(false);
	const pushDocument = usePushDocument();
	const t = useT();

	/**
	 *
	 */
	const handlePay = React.useCallback(async () => {
		setLoading(true);
		try {
			await pushDocument(currentOrder).then((savedDoc) => {
				if (isRxDocument(savedDoc)) {
					navigation.dispatch(StackActions.push('Checkout', { orderID: currentOrder.uuid }));
				}
			});
		} catch (error) {
			Toast.show({
				type: 'error',
				text1: t('{message}', { _tags: 'core', message: error.message || 'Error' }),
			});
		} finally {
			setLoading(false);
		}
	}, [pushDocument, currentOrder, navigation, t]);

	/**
	 *
	 */
	return (
		<Button
			size="lg"
			onPress={handlePay}
			variant="success"
			className="rounded-t-none rounded-bl-none flex-[3]"
			loading={loading}
		>
			{t('Checkout {order_total}', {
				order_total: format(parseFloat(total) || 0),
				_tags: 'core',
			})}
		</Button>
	);
};
