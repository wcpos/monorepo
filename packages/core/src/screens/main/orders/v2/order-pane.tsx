import * as React from 'react';
import { Platform, ScrollView, View, type ViewInstance } from 'react-native';

import { useRouter } from 'expo-router';
import { useObservableSuspense } from 'observable-hooks';

import { Button } from '@wcpos/components/button';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { IconButton } from '@wcpos/components/icon-button';
import { StatusBadge } from '@wcpos/components/status-badge';
import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { useT } from '../../../../contexts/translations';
import { CreatedVia } from '../../components/order/created-via';
import { useProAccess } from '../../contexts/pro-access';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { useEngineRecord } from '../../hooks/use-engine-document';
import {
	AddressesRail,
	CustomerNoteSection,
	CustomerRail,
	TaxIdsRail,
} from '../view/sections/customer';
import { LineItemsSection } from '../view/sections/line-items';
import { PaymentSection } from '../view/sections/payment';
import { POSMetadataSection } from '../view/sections/pos-metadata';
import { RefundsFallback, RefundsSection, RefundsSkeleton } from '../view/sections/refunds';
import { totalRefunded } from '../view/sections/total-refunded';
import { TotalsSection } from '../view/sections/totals';
import { useOrderRefunds } from '../view/use-order-refunds';
import { OrderStatusBadge } from './cells/status';
import { OrderActionsMenu } from './order-menu';

type Props = { selected: string; onClose: () => void };
type OrderPayload = EngineRecord<'orders'>['payload'];
const REFUNDABLE_STATUSES: readonly string[] = ['completed', 'processing', 'on-hold'];

export function OrderPane(props: Props) {
	return (
		<View testID="order-pane" className="min-h-0 flex-1">
			<ErrorBoundary key={props.selected}>
				<React.Suspense
					fallback={<View testID="order-pane-skeleton" className="bg-muted m-4 h-48 rounded" />}
				>
					<OrderPaneContent {...props} />
				</React.Suspense>
			</ErrorBoundary>
		</View>
	);
}

function OrderPaneContent({ selected, onClose }: Props) {
	const order = useObservableSuspense(useEngineRecord('orders', selected));
	const payload = useRecordField(order, (record) => record.payload);
	const t = useT();
	const router = useRouter();
	const { readOnly } = useProAccess();
	const { format } = useCurrencyFormat({ currencySymbol: payload?.currency_symbol });
	const [refundsRetryKey, setRefundsRetryKey] = React.useState(0);
	const focusClose = React.useCallback((node: ViewInstance | null) => {
		if (Platform.OS === 'web') node?.focus();
	}, []);
	const close = (
		<IconButton
			name="xmark"
			testID="order-pane-close"
			aria-label={t('orders.close_order')}
			{...{ ref: focusClose }}
			onPress={onClose}
		/>
	);
	if (!order || !payload)
		return (
			<View className="p-4">
				{close}
				<Text>{t('common.no_order_found')}</Text>
			</View>
		);
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
	const canRefund =
		!!payload.id && !!payload.status && REFUNDABLE_STATUSES.includes(payload.status);
	return (
		<>
			<View className="border-border h-12 flex-row items-center gap-2 border-b px-2">
				<Text className="font-semibold">#{payload.number || payload.id || '—'}</Text>
				<View testID="order-pane-source">
					<CreatedVia
						{...({ row: { original: { record: order } } } as React.ComponentProps<
							typeof CreatedVia
						>)}
					/>
				</View>
				<View className="flex-1" />
				{!readOnly && (
					<OrderActionsMenu
						order={order}
						onDeleted={onClose}
						trigger={
							<IconButton
								name="ellipsisVertical"
								iconClassName="rotate-90"
								testID="order-actions-button"
								aria-label={t('orders.order_actions')}
							/>
						}
					/>
				)}
				{close}
			</View>
			<ScrollView testID="order-pane-scroll" className="min-h-0 flex-1">
				<View className="border-border gap-2 border-b p-4">
					<Text className="text-amt tabular-nums">{format(Number(payload.total || 0))}</Text>
					{syntheticLabel ? (
						<StatusBadge
							label={syntheticLabel}
							variant={status === 'pos-open' ? 'info' : 'warning'}
						/>
					) : (
						<OrderStatusBadge status={payload.status} />
					)}
				</View>
				<LineItemsSection order={payload} />
				<TotalsSection order={payload} />
				{payload.id ? (
					<RefundsBoundary
						key={refundsRetryKey}
						order={payload}
						orderUuid={order.uuid}
						orderId={payload.id}
						onRetry={() => setRefundsRetryKey((key) => key + 1)}
					/>
				) : null}
				<CustomerNoteSection order={payload} />
				<CustomerRail order={payload} />
				<AddressesRail order={payload} />
				<TaxIdsRail order={payload} />
				<PaymentSection order={payload} />
				<POSMetadataSection order={payload} last />
			</ScrollView>
			<View className="border-border flex-row justify-end gap-2 border-t p-2">
				{canRefund && (
					<Button
						variant="outline-destructive"
						testID="order-pane-refund"
						onPress={() =>
							router.push({ pathname: '/orders/refund/[orderId]', params: { orderId: order.uuid } })
						}
					>
						{t('orders.refund')}
					</Button>
				)}
				{!!payload.id && (
					<Button
						testID="order-pane-print"
						onPress={() =>
							router.push({
								pathname: '/orders/receipt/[orderId]',
								params: { orderId: order.uuid },
							})
						}
					>
						{t('orders.print_receipt')}
					</Button>
				)}
			</View>
		</>
	);
}

function RefundsBoundary({
	order,
	orderUuid,
	orderId,
	onRetry,
}: {
	order: OrderPayload;
	orderUuid: string;
	orderId: number;
	onRetry: () => void;
}) {
	const resource = useOrderRefunds(orderId);
	function RefundsErrorFallback({ resetErrorBoundary }: { resetErrorBoundary: () => void }) {
		return (
			<RefundsFallback
				refunds={order.refunds}
				currencySymbol={order.currency_symbol}
				onRetry={() => {
					onRetry();
					resetErrorBoundary();
				}}
			/>
		);
	}
	return (
		<ErrorBoundary FallbackComponent={RefundsErrorFallback}>
			<React.Suspense fallback={<RefundsSkeleton />}>
				<RefundsSection order={order} orderUuid={orderUuid} resource={resource} />
			</React.Suspense>
		</ErrorBoundary>
	);
}
