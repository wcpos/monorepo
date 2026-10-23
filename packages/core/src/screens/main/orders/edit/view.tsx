import * as React from 'react';
import { View } from 'react-native';

import { useRouter } from 'expo-router';

import { Button } from '@wcpos/components/button';
import { DialogBody, DialogFooter, useDialog } from '@wcpos/components/dialog';
import { StatusBadge } from '@wcpos/components/status-badge';
import { Text } from '@wcpos/components/text';
import { activeAwaitingCustomer } from '@wcpos/order-math';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { useT } from '../../../../contexts/translations';
import { CreatedVia } from '../../components/order/created-via';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { OrderStatusBadge } from '../cells/status';
import { InvoiceActions } from '../invoice-actions';
import { DeleteOrderDialog, useOrderActions } from '../order-actions';
import { RefundsBoundary } from '../view/refunds-boundary';
import {
	AddressesRail,
	CustomerNoteSection,
	CustomerRail,
	TaxIdsRail,
} from '../view/sections/customer';
import { LineItemsSection } from '../view/sections/line-items';
import { PaymentSection } from '../view/sections/payment';
import { POSMetadataSection } from '../view/sections/pos-metadata';
import { totalRefunded } from '../view/sections/total-refunded';
import { TotalsSection } from '../view/sections/totals';

/**
 * The order modal's View tab: the order read top to bottom, and its actions in the footer.
 * `readOnly` is the modal's (Free browses, never edits): the footer keeps only the receipt.
 */
export function OrderView({
	order,
	readOnly,
}: {
	order: EngineRecord<'orders'>;
	readOnly: boolean;
}) {
	const payload = useRecordField(order, (record) => record.payload);
	const t = useT();
	const router = useRouter();
	const { close } = useDialog();
	const { format } = useCurrencyFormat({ currencySymbol: payload.currency_symbol });
	const actions = useOrderActions(order, { onDeleted: close });
	const refundedAmount = totalRefunded(payload.refunds);
	const status =
		refundedAmount > 0 && refundedAmount < Number(payload.total)
			? 'partially-refunded'
			: payload.status;
	const syntheticLabel =
		status === 'partially-refunded'
			? t('orders.status.partially-refunded')
			: status === 'pos-open'
				? t('orders.status.pos-open')
				: status === 'pos-partial'
					? t('orders.status.pos-partial')
					: undefined;
	// Contract 1.2 §4.3: a sent order waits for its customer; any money taken since clears it.
	const invoiceStamp = payload.id ? activeAwaitingCustomer(payload.meta_data) : null;
	const receipt = !!payload.id && (
		<Button
			testID="order-modal-receipt"
			onPress={() =>
				router.push({ pathname: '/orders/receipt/[orderId]', params: { orderId: order.uuid } })
			}
		>
			{t('common.receipt')}
		</Button>
	);
	return (
		<>
			{/* The sections draw their own gutters and hairlines: the body adds none. */}
			<DialogBody
				testID="order-modal-view"
				className="gap-0 px-0 py-0"
				contentContainerClassName="p-0"
			>
				<View className="border-border gap-2 border-b p-4">
					<Text className="text-amt tabular-nums">{format(Number(payload.total || 0))}</Text>
					<View className="flex-row flex-wrap items-center gap-2">
						{syntheticLabel ? (
							<StatusBadge
								label={syntheticLabel}
								variant={status === 'pos-open' ? 'info' : 'warning'}
							/>
						) : (
							<OrderStatusBadge status={payload.status} />
						)}
						<CreatedVia
							{...({ row: { original: { record: order } } } as React.ComponentProps<
								typeof CreatedVia
							>)}
						/>
					</View>
				</View>
				<LineItemsSection order={payload} />
				<TotalsSection order={payload} />
				{payload.id ? (
					<RefundsBoundary order={payload} orderUuid={order.uuid} orderId={payload.id} />
				) : null}
				<CustomerNoteSection order={payload} />
				<CustomerRail order={payload} />
				<AddressesRail order={payload} />
				<TaxIdsRail order={payload} />
				<PaymentSection order={payload} />
				<POSMetadataSection order={payload} last />
			</DialogBody>
			{readOnly ? (
				// Everything but the receipt changes the order (ledger line 8).
				receipt && <DialogFooter>{receipt}</DialogFooter>
			) : (
				<DialogFooter className="justify-between">
					{/* Destructive on the left, apart from the constructive actions. */}
					<View className="flex-row flex-wrap gap-2">
						<Button
							variant="outline-destructive"
							testID="order-modal-delete"
							onPress={actions.requestDelete}
							disabled={actions.storageDegraded}
						>
							{t('common.delete')}
						</Button>
						{actions.canRefund && (
							<Button
								variant="outline-destructive"
								testID="order-modal-refund"
								onPress={actions.refund}
								disabled={actions.storageDegraded}
							>
								{t('orders.refund')}
							</Button>
						)}
					</View>
					<View className="flex-row flex-wrap gap-2">
						{invoiceStamp ? <InvoiceActions order={order} stamp={invoiceStamp} /> : null}
						{!!payload.id && (
							<Button variant="outline" testID="order-modal-sync" onPress={actions.sync}>
								{t('common.sync')}
							</Button>
						)}
						<Button
							variant="outline"
							testID="order-modal-reopen"
							onPress={actions.reopen}
							loading={actions.reopening}
							disabled={actions.storageDegraded || actions.reopening}
						>
							{t('orders.re-open')}
						</Button>
						{receipt}
					</View>
				</DialogFooter>
			)}
			{!readOnly && (
				<DeleteOrderDialog
					orderID={actions.orderID}
					open={actions.deleteOpen}
					onOpenChange={actions.setDeleteOpen}
					onConfirm={actions.confirmDelete}
					disabled={actions.storageDegraded}
				/>
			)}
		</>
	);
}
