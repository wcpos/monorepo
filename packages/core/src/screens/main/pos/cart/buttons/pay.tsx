import * as React from 'react';

import { useRouter } from 'expo-router';
import { useObservableEagerState } from 'observable-hooks';
import { isRxDocument } from 'rxdb';

import { Button } from '@wcpos/components/button';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../../../contexts/translations';
import usePushDocument from '../../../contexts/use-push-document';
import { useCurrentOrderCurrencyFormat } from '../../../hooks/use-current-order-currency-format';
import { useCurrentOrder } from '../../contexts/current-order';

const checkoutLogger = getLogger(['wcpos', 'pos', 'checkout']);

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
		const orderLogger = checkoutLogger.with({
			orderId: currentOrder.uuid,
			orderNumber: currentOrder.number,
		});

		try {
			await pushDocument(currentOrder).then((savedDoc) => {
				if (isRxDocument(savedDoc)) {
					// Log checkout started
					orderLogger.info(t('Checkout started'), {
						saveToDb: true,
						context: {
							total,
							lineItemCount: currentOrder.line_items?.length || 0,
						},
					});

					router.push({
						pathname: `(modals)/cart/${currentOrder.uuid}/checkout`,
					});
				}
			});
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			orderLogger.error(t('Checkout failed'), {
				showToast: true,
				saveToDb: true,
				context: {
					errorCode: ERROR_CODES.TRANSACTION_FAILED,
					error: errorMessage,
				},
			});
		} finally {
			setLoading(false);
		}
	}, [pushDocument, currentOrder, router, t, total]);

	/**
	 *
	 */
	return (
		<Button
			size="lg"
			onPress={handlePay}
			variant="success"
			className="flex-3 rounded-t-none rounded-bl-none"
			loading={loading}
		>
			{t('Checkout {order_total}', {
				order_total: format(parseFloat(total) || 0),
			})}
		</Button>
	);
};
