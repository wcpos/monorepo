import * as React from 'react';

import { useNavigation, StackActions } from '@react-navigation/native';
import { useObservableState } from 'observable-hooks';
import { isRxDocument } from 'rxdb';

import Button from '@wcpos/components/src/button';
import { useSnackbar } from '@wcpos/components/src/snackbar/use-snackbar';

import { t } from '../../../../../lib/translations';
import usePushDocument from '../../../contexts/use-push-document';
import useCurrencyFormat from '../../../hooks/use-currency-format';
import useCurrentOrder from '../../contexts/current-order';

/**
 *
 */
const PayButton = () => {
	const { currentOrder } = useCurrentOrder();
	const total = useObservableState(currentOrder.total$, currentOrder.total);
	const { format } = useCurrencyFormat();
	const navigation = useNavigation();
	const [loading, setLoading] = React.useState(false);
	const addSnackbar = useSnackbar();
	const pushDocument = usePushDocument();

	/**
	 *
	 */
	const handlePay = React.useCallback(async () => {
		setLoading(true);
		try {
			await pushDocument(currentOrder).then((savedDoc) => {
				if (isRxDocument(savedDoc)) {
					debugger;
					navigation.dispatch(StackActions.push('Checkout', { orderID: currentOrder.uuid }));
				}
			});
		} catch (error) {
			addSnackbar({
				message: t('{message}', { _tags: 'core', message: error.message || 'Error' }),
			});
		} finally {
			setLoading(false);
		}
	}, [pushDocument, currentOrder, navigation, addSnackbar]);

	/**
	 *
	 */
	return (
		<Button
			fill
			size="large"
			title={t('Checkout {order_total}', { order_total: format(total || 0), _tags: 'core' })}
			onPress={handlePay}
			type="success"
			style={{
				flex: 3,
				borderTopLeftRadius: 0,
				borderTopRightRadius: 0,
				borderBottomLeftRadius: 0,
			}}
			loading={loading}
		/>
	);
};

export default PayButton;
