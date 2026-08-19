import * as React from 'react';

import { useRouter } from 'expo-router';
import { useObservableEagerState } from 'observable-hooks';
import { isRxDocument } from 'rxdb';

import { Button } from '@wcpos/components/button';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { getNetPaymentTotal } from '@wcpos/order-math';

import { useT } from '../../../../../contexts/translations';
import { usePushDocument } from '../../../contexts/use-push-document';
import { useCurrentOrderCurrencyFormat } from '../../../hooks/use-current-order-currency-format';
import { useStorageMoneyPathGuard } from '../../../hooks/use-storage-health';
import { useCurrentOrder } from '../../contexts/current-order';

const checkoutLogger = getLogger(['wcpos', 'pos', 'checkout']);

/**
 *
 */
export function PayButton() {
	const { currentOrder } = useCurrentOrder();
	const total = useObservableEagerState(currentOrder.total$!);
	const refunds = useObservableEagerState(currentOrder.refunds$!);
	const { format } = useCurrentOrderCurrencyFormat();
	const router = useRouter();
	const [loading, setLoading] = React.useState(false);
	const pushDocument = usePushDocument();
	const t = useT();
	const { storageDegraded, blockIfDegraded } = useStorageMoneyPathGuard();

	const displayTotal = getNetPaymentTotal(total, refunds);

	/**
	 *
	 */
	const handlePay = React.useCallback(async () => {
		// #163 ruling R5: a dead storage worker hard-blocks the money paths. Cash
		// taken for an order the device cannot persist has no local record at all.
		if (blockIfDegraded('checkout', { orderId: currentOrder.uuid! })) {
			return;
		}

		setLoading(true);
		const orderLogger = checkoutLogger.with({
			orderId: currentOrder.uuid!,
			orderNumber: currentOrder.number,
		});

		try {
			await pushDocument(currentOrder).then((savedDoc) => {
				if (isRxDocument(savedDoc)) {
					// Re-checked after the await: the worker can die mid-push, and
					// opening the payment modal then would let the cashier take money
					// for an order this device can no longer record.
					if (blockIfDegraded('checkout', { orderId: currentOrder.uuid! })) {
						return;
					}

					// Log checkout started
					orderLogger.info(t('pos_cart.checkout_started'), {
						context: {
							total,
							lineItemCount: currentOrder.line_items?.length ?? 0,
						},
					});

					router.push({
						pathname: '/(app)/(drawer)/(pos)/(modals)/cart/[orderId]/checkout',
						params: { orderId: currentOrder.uuid! },
					});
				}
			});
		} catch (error) {
			const errorMessage = getErrorMessage(error);
			orderLogger.error('Checkout failed', {
				showToast: true,
				code: ERROR_CODES.CHECKOUT_FAILED_CART_SAFE,
				toast: { title: t('pos_cart.checkout_failed') },
				context: {
					error: errorMessage,
				},
			});
		} finally {
			setLoading(false);
		}
	}, [blockIfDegraded, pushDocument, currentOrder, router, t, total]);

	/**
	 *
	 */
	return (
		<Button
			testID="checkout-button"
			size="lg"
			onPress={handlePay}
			variant="success"
			className="flex-3 rounded-t-none rounded-bl-none"
			loading={loading}
			disabled={storageDegraded}
		>
			{t('pos_cart.checkout', {
				order_total: format(displayTotal || 0),
			})}
		</Button>
	);
}
