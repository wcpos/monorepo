import * as React from 'react';

import { useRouter } from 'expo-router';
import { useObservableEagerState } from 'observable-hooks';
import { isRxDocument } from 'rxdb';

import { Button } from '@wcpos/components/button';
import { Toast } from '@wcpos/components/toast';

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
	const router = useRouter();
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
					router.push({
						pathname: `(modals)/cart/${currentOrder.uuid}/checkout`,
					});
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
	}, [pushDocument, currentOrder, router, t]);

	/**
	 *
	 */
	return (
		<Button
			size="lg"
			onPress={handlePay}
			variant="success"
			className="flex-[3] rounded-t-none rounded-bl-none"
			loading={loading}
		>
			{t('Checkout {order_total}', {
				order_total: format(parseFloat(total) || 0),
				_tags: 'core',
			})}
		</Button>
	);
};
