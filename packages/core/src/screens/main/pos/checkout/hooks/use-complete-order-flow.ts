import * as React from 'react';

import { useRouter } from 'expo-router';

import { type EngineRecord } from '@wcpos/query';

import { useTheme } from '../../../../../contexts/theme';
import { leaveCheckout } from '../checkout-mode';
import { useUISettings } from '../../../contexts/ui-settings';
import { useCurrentOrderActions } from '../../contexts/current-order/context';
import { completeSale, type SaleOutcome } from '../sale-completion';
import { useSaleContext } from './use-sale-context';

/** Finish checkout from the freshest available order before leaving the cart. */
export function useCompleteOrderFlow(
	order: EngineRecord<'orders'>,
	receiptHost: 'stage' | 'modal' = 'stage'
): (outcome: SaleOutcome) => Promise<void> {
	const ctx = useSaleContext();
	const { uiSettings } = useUISettings('pos-cart');
	const router = useRouter();
	const { screenSize } = useTheme();
	const { setCurrentOrderID } = useCurrentOrderActions();

	return React.useCallback(
		async (outcome: SaleOutcome) => {
			if (
				(await completeSale(
					ctx,
					order,
					outcome,
					receiptHost === 'stage'
						? { host: 'stage', autoShowReceipt: !!uiSettings.autoShowReceipt }
						: { host: 'modal' }
				)) !== 'completed'
			)
				return;
			// The webview already routed before catch-up; never route it a second time.
			if (outcome.source === 'gateway-snapshot') return;

			// The pre-tender contract checkout still hosts receipts in a routed modal.
			if (receiptHost === 'modal') {
				setCurrentOrderID('');
				router.replace(
					uiSettings.autoShowReceipt
						? {
								pathname: '/(app)/(drawer)/(pos)/(modals)/cart/receipt/[orderId]',
								params: { orderId: order.uuid },
							}
						: { pathname: '/cart' }
				);
				return;
			}

			if (!uiSettings.autoShowReceipt) {
				leaveCheckout(order.uuid);
				setCurrentOrderID('');
				if (screenSize === 'sm') router.replace({ pathname: '/cart' });
			}
		},
		[ctx, receiptHost, order, router, screenSize, setCurrentOrderID, uiSettings.autoShowReceipt]
	);
}
