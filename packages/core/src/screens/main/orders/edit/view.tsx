import * as React from 'react';
import { View } from 'react-native';

import { useRouter } from 'expo-router';

import { DialogBody, DialogFooter, useDialog } from '@wcpos/components/dialog';
import { StatusBadge } from '@wcpos/components/status-badge';
import { Text } from '@wcpos/components/text';
import { activeAwaitingCustomer } from '@wcpos/order-math';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import { wooMetaCarrier } from '@wcpos/sync-core';

import { useT } from '../../../../contexts/translations';
import { useStoreDayLabel } from '../../../../hooks/use-store-day-label';
import { CreatedVia } from '../../components/order/created-via';
import { useCashierLabel } from '../../hooks/use-cashier-label';
import { useStoreLabel } from '../../hooks/use-store-label';
import { OrderStatusBadge } from '../cells/status';
import { useInvoiceActions } from '../invoice-actions';
import { DeleteOrderDialog, useOrderActions } from '../order-actions';
import { RefundsBoundary } from '../view/refunds-boundary';
import { CustomerSection } from '../view/sections/customer';
import { LineItemsSection } from '../view/sections/line-items';
import { PaymentSection } from '../view/sections/payment';
import { totalRefunded } from '../view/sections/total-refunded';
import { TotalsSection } from '../view/sections/totals';

/**
 * The identity line under the status: when · store · cashier · via (the order-summary board,
 * 2026-10-23). It replaces the big total and the Metadata section. The store shows only when
 * the order carries one: `_pos_store` 0 is no store attribution.
 */
function OrderIdentity({ order }: { order: EngineRecord<'orders'> }) {
	const created = useRecordField(order, (record) => record.payload.date_created_gmt);
	const meta = useRecordField(order, (record) => record.payload.meta_data);
	const { cashierId, storeId } = wooMetaCarrier.readIdentity(meta);
	const store = useStoreLabel(Number(storeId) > 0 ? storeId : undefined).label;
	const cashier = useCashierLabel(cashierId ?? undefined).label;
	const { dateTime } = useStoreDayLabel();
	// Each part is its own Text: the base Text draws foreground at base size, so a bare nested
	// Text would not inherit the line's muted small recipe.
	const muted = 'text-muted-foreground text-sm';
	const parts = [
		created && (
			<Text key="when" className={muted}>
				{dateTime(created)}
			</Text>
		),
		store && (
			<Text key="store" className="text-foreground text-sm font-medium">
				{store}
			</Text>
		),
		cashier && (
			<Text key="cashier" className={muted}>
				{cashier}
			</Text>
		),
	].filter(Boolean);
	return (
		<View testID="order-modal-identity" className="flex-row flex-wrap items-center">
			<Text className={muted}>
				{parts.flatMap((part, index) => (index > 0 ? [' · ', part] : [part]))}
				{parts.length > 0 ? ' · ' : null}
			</Text>
			<CreatedVia
				{...({ row: { original: { record: order } } } as React.ComponentProps<typeof CreatedVia>)}
			/>
		</View>
	);
}

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

	const invoice = useInvoiceActions({ order, stamp: readOnly ? null : invoiceStamp });
	const receipt = !!payload.id && {
		label: t('common.receipt'),
		testID: 'order-modal-receipt',
		onPress: () =>
			router.push({ pathname: '/orders/receipt/[orderId]', params: { orderId: order.uuid } }),
	};

	return (
		<>
			{/* The sections draw their own gutters and hairlines: the body adds none. */}
			<DialogBody
				testID="order-modal-view"
				className="gap-0 px-0 py-0"
				contentContainerClassName="p-0"
			>
				{/* No big total: the Total row in Totals is the one number (Paul, 2026-10-23). */}
				<View className="border-border gap-2 border-b p-4">
					<View className="flex-row">
						{syntheticLabel ? (
							<StatusBadge
								label={syntheticLabel}
								variant={status === 'pos-open' ? 'info' : 'warning'}
							/>
						) : (
							<OrderStatusBadge status={payload.status} />
						)}
					</View>
					<OrderIdentity order={order} />
				</View>
				<LineItemsSection order={payload} />
				<TotalsSection order={payload} />
				<PaymentSection order={order} />
				{payload.id ? (
					<RefundsBoundary order={payload} orderUuid={order.uuid} orderId={payload.id} />
				) : null}
				<CustomerSection order={payload} last />
			</DialogBody>

			{/* Everything but the receipt changes the order (ledger line 8). */}
			{readOnly ? (
				receipt && <DialogFooter secondary={receipt} />
			) : (
				<DialogFooter
					intent={{
						label: t('orders.re-open'),
						testID: 'order-modal-reopen',
						onPress: () => void actions.reopen(),
						loading: actions.reopening,
						disabled: actions.storageDegraded || actions.reopening,
					}}
					secondary={[...invoice.secondary, receipt]}
					record={
						!!payload.id && {
							label: t('common.sync'),
							testID: 'order-modal-sync',
							onPress: actions.sync,
						}
					}
					destructive={[
						{
							label: t('common.delete'),
							testID: 'order-modal-delete',
							onPress: actions.requestDelete,
							disabled: actions.storageDegraded,
						},
						actions.canRefund && {
							label: t('orders.refund'),
							testID: 'order-modal-refund',
							onPress: actions.refund,
							disabled: actions.storageDegraded,
						},
						...invoice.destructive,
					]}
				/>
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
