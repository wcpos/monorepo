import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { Chip } from '@wcpos/components/chip';
import { HStack } from '@wcpos/components/hstack';
import { StatusBadge } from '@wcpos/components/status-badge';
import { Text } from '@wcpos/components/text';
import { type EngineRecord, useDocField, useRecordField } from '@wcpos/query';

import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { useCustomerNameFormat } from '../../hooks/use-customer-name-format';
import { useCheckoutMode } from '../checkout/checkout-mode';
import { useOrderSaving } from '../checkout/use-order-save-state';
import { useLedgerView } from '../checkout/tender/use-ledger-view';
import { LedgerLegs } from '../checkout/tender/ledger-pane';
import { useLineItemData } from '../hooks/use-line-item-data';
import { getUuidFromLineItem } from '../hooks/utils';

// The stilled head's columns, shared by its labels and the lines beneath: the amount
// columns hold a spacing-based width as the cart table's do, the name takes the rest.
const LEDGER_COLUMNS = {
	qty: 'w-12',
	item: 'min-w-0 flex-1',
	price: 'w-18 text-right',
	total: 'w-20 text-right',
} as const;

export function CheckoutLedger({ order }: { order: EngineRecord<'orders'> }) {
	const paidBy = useCheckoutMode().linesPaidBy.get(order.uuid);
	const saving = useOrderSaving(order.uuid);
	const view = useLedgerView(order);
	const { format } = view;
	const payload = useRecordField(order, (record) => record.payload);
	const { format: formatCurrency } = useCurrencyFormat({ currencySymbol: payload.currency_symbol });
	const { format: formatName } = useCustomerNameFormat();
	const { store } = useAppState();
	// The same figure the cart's Total column showed a moment ago: with prices shown
	// tax-inclusive the line total carries its tax, otherwise it is the net (product-total.tsx).
	const taxDisplayCart = useDocField(store, (value) => value.tax_display_cart);
	const { getLineItemData } = useLineItemData();
	const t = useT();
	const lines = React.useMemo(
		() =>
			(payload.line_items ?? []).map((item) => ({
				id: getUuidFromLineItem(item) ?? item.id,
				name: item.name,
				quantity: item.quantity,
				// The unit price the cart's Price column showed (use-line-item-data).
				price: formatCurrency(Number(getLineItemData(item).price ?? 0)),
				total: formatCurrency(
					Number(item.total ?? 0) + (taxDisplayCart === 'incl' ? Number(item.total_tax ?? 0) : 0)
				),
			})),
		[payload.line_items, formatCurrency, taxDisplayCart, getLineItemData]
	);
	return (
		// No Card: the ledger is the cart's own frame with a stilled head (decision 49), not a
		// rounded, bordered box inside the column.
		<View className="flex-1">
			<View className="border-border border-b px-2 py-2" testID="checkout-ledger-header">
				{/* Same height as the cart header it replaces, so the strip and totals below
				    do not move when the column swaps. */}
				<HStack className="h-ctl items-center gap-2">
					{saving && !payload.number ? (
						<View className="bg-muted h-4 w-12 rounded" testID="checkout-ledger-number-skeleton" />
					) : (
						<Chip disabled label={`#${payload.number ?? ''}`} />
					)}
					<Chip disabled label={formatName({ ...payload.billing, customer_id: 0 })} />
				</HStack>
			</View>
			<View className="flex-1">
				<HStack className="border-border min-h-row items-center gap-2 border-b px-4">
					{(['qty', 'item', 'price', 'total'] as const).map((column) => (
						<Text
							key={column}
							className={`text-muted-foreground text-xs tracking-wide uppercase ${LEDGER_COLUMNS[column]}`}
						>
							{t(`pos_cart.col_${column}`)}
						</Text>
					))}
				</HStack>
				<ScrollView className="flex-1" contentContainerClassName="gap-4 p-4">
					{/* The lines sit under the stilled head, so they keep its four columns; the
					    tender pane's LedgerLines is a different, headless shape. */}
					<View className="gap-2">
						{lines.map((line, index) => (
							<HStack key={line.id ?? index} className="items-start gap-2">
								<Text
									testID={`checkout-ledger-qty-${line.id}`}
									className={`text-muted-foreground text-sm tabular-nums ${LEDGER_COLUMNS.qty}`}
								>
									{line.quantity ?? 1}
								</Text>
								<View className={`gap-1 ${LEDGER_COLUMNS.item}`}>
									<Text className="text-sm" numberOfLines={2} decodeHtml>
										{line.name ?? ''}
									</Text>
									{line.id !== undefined && paidBy?.[line.id] ? (
										<StatusBadge
											variant="success"
											label={t('pos_checkout.line_paid_by', {
												methods: paidBy[line.id].join(' + '),
											})}
										/>
									) : null}
								</View>
								<Text
									testID={`checkout-ledger-price-${line.id}`}
									className={`text-muted-foreground text-sm tabular-nums ${LEDGER_COLUMNS.price}`}
								>
									{line.price}
								</Text>
								<Text
									testID={`checkout-ledger-total-${line.id}`}
									className={`text-sm tabular-nums ${LEDGER_COLUMNS.total}`}
								>
									{line.total}
								</Text>
							</HStack>
						))}
					</View>
					<View className="gap-2">
						<Text className="text-muted-foreground text-xs tracking-wider uppercase">
							{t('pos_checkout.payments_tab')}
						</Text>
						<LedgerLegs view={view} format={format} />
					</View>
				</ScrollView>
				<View testID="checkout-ledger-totals" className="border-border gap-2 border-t p-4">
					<HStack className="justify-between">
						<Text>{t('common.total')}</Text>
						<Text testID="checkout-order-total">{format(view.totalMinor)}</Text>
					</HStack>
					<HStack className="justify-between">
						<Text>{t('pos_checkout.paid')}</Text>
						<Text>{format(view.paidMinor)}</Text>
					</HStack>
					<HStack className="justify-between">
						<Text className="font-bold">{t('pos_checkout.remaining')}</Text>
						<Text className="font-bold" testID="checkout-ledger-remaining">
							{format(view.balanceMinor)}
						</Text>
					</HStack>
				</View>
			</View>
		</View>
	);
}
