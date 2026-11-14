import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@wcpos/components/dialog';
import { EmptyState } from '@wcpos/components/empty-state';
import { Text } from '@wcpos/components/text';
import { getNetPaymentTotal } from '@wcpos/order-math';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { PrintSheetContent } from './print-sheet';
import { useReceiptActions } from './receipt-actions';
import { useReceiptDocument } from './use-receipt-document';
import { useT } from '../../../contexts/translations';
import { useCurrencyFormat } from '../hooks/use-currency-format';
import { usePaymentGateways } from '../hooks/use-payment-gateways';
import { isSettledOrderStatus } from '../pos/checkout/sale-completion';

interface Props {
	resource: ObservableResource<EngineRecord<'orders'> | null>;
	document?: string;
	side?: 'left' | 'right';
}

/**
 *
 */
export function Receipt({ resource, document, side = 'right' }: Props) {
	const order = useObservableSuspense(resource);
	const t = useT();

	if (!order) {
		return (
			<Dialog route>
				<DialogContent side={side} size="xl">
					<DialogHeader>
						<DialogTitle>
							<Text>{t('common.receipt')}</Text>
						</DialogTitle>
					</DialogHeader>
					<EmptyState kind="empty" title={t('common.no_order_found')} />
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<ReceiptDocument
			key={`${order.uuid}:${document ?? ''}`}
			order={order}
			document={document}
			side={side}
		/>
	);
}

function ReceiptDocument({
	order,
	document,
	side = 'right',
}: {
	order: EngineRecord<'orders'>;
	document?: string;
	side?: 'left' | 'right';
}) {
	const t = useT();
	const doc = useReceiptDocument({ order, autoPrintAllowed: false, document });
	const { sync, choices, print, dialog } = useReceiptActions(doc, order);
	const status = useRecordField(order, (o) => o.payload.status);
	const paymentMethod = useRecordField(order, (o) => o.payload.payment_method);
	const total = useRecordField(order, (o) => o.payload.total);
	const refunds = useRecordField(order, (o) => o.payload.refunds);
	const currencySymbol = useRecordField(order, (o) => o.payload.currency_symbol);
	const { gateway } = usePaymentGateways(paymentMethod, !!paymentMethod);
	const { format } = useCurrencyFormat({ currencySymbol });
	// A missing status fails closed, as the auto-print does: an order not known to be paid is marked.
	const notPaid = !document && !isSettledOrderStatus(status ?? '', gateway?.settled_order_status);
	return (
		<Dialog route>
			<PrintSheetContent
				doc={doc}
				title={document ? t('receipt.refund_receipt') : t('common.receipt')}
				description={
					notPaid ? (
						<Text className="text-warning-text" testID="receipt-not-paid">
							{t('receipt.not_paid_amount_due', {
								amount: format(getNetPaymentTotal(total, refunds) || 0),
							})}
						</Text>
					) : undefined
				}
				printLabel={t('receipt.print_receipt')}
				primary={sync}
				secondary={choices}
				onPrint={print.onPress}
				side={side}
				testID="receipt-dialog"
				close={{ testID: 'receipt-close-button' }}
				printTestID="receipt-print-button"
			>
				{dialog}
			</PrintSheetContent>
		</Dialog>
	);
}
