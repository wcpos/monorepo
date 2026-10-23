import * as React from 'react';
import { View } from 'react-native';

import toNumber from 'lodash/toNumber';

import { Image } from '@wcpos/components/image';
import { TABLE_HEAD_TEXT } from '@wcpos/components/table';
import { Text } from '@wcpos/components/text';
import type { EngineRecord } from '@wcpos/query';

import { Section } from './_section';
import { useT } from '../../../../../contexts/translations';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';

type OrderPayload = EngineRecord<'orders'>['payload'];
type LineItem = NonNullable<OrderPayload['line_items']>[number];
type FeeLine = NonNullable<OrderPayload['fee_lines']>[number];

function visibleMeta(metaData: LineItem['meta_data']) {
	return (metaData || []).filter((entry) => entry.key && !String(entry.key).startsWith('_'));
}

function LineItemRow({
	item,
	format,
	t,
	last,
}: {
	item: LineItem;
	format: (n: number) => string;
	t: ReturnType<typeof useT>;
	last?: boolean;
}) {
	const subtotal = toNumber(item.subtotal);
	const total = toNumber(item.total);
	const discounted = subtotal > total;
	const qty = item.quantity ?? 0;
	const originalUnit = qty > 0 ? subtotal / qty : toNumber(item.price);
	const unit = qty > 0 ? (discounted ? total / qty : subtotal / qty) : toNumber(item.price);
	const variations = visibleMeta(item.meta_data);

	return (
		<View
			className={`flex-row items-center gap-3 py-2.5 ${last ? '' : 'border-border/60 border-b'}`}
		>
			<View className="w-8">
				<Text className="text-foreground text-sm tabular-nums">{qty}</Text>
			</View>
			<View className="min-w-0 flex-1 flex-row items-center gap-2.5">
				<View className="bg-muted h-7 w-7 overflow-hidden rounded">
					{item.image?.src ? <Image source={{ uri: item.image.src }} className="h-7 w-7" /> : null}
				</View>
				<View className="min-w-0 flex-1 gap-0.5">
					{/* A line item's name is the product title copied at sale time, so it
					    carries the same HTML entities the catalogue does — the cart decodes
					    it via EditableField, and this read-only view must match. */}
					<Text className="text-foreground text-sm font-medium" numberOfLines={2} decodeHtml>
						{item.name || '—'}
					</Text>
					{item.parent_name && item.parent_name !== item.name ? (
						<Text className="text-muted-foreground text-xs" decodeHtml>
							{item.parent_name}
						</Text>
					) : null}
					<View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
						{item.sku ? (
							<View className="bg-primary/10 rounded px-1.5 py-0.5">
								<Text className="text-primary text-xs font-medium tabular-nums">{item.sku}</Text>
							</View>
						) : null}
						{variations.map((entry, index) => (
							<Text
								key={`${entry.key ?? 'meta'}-${index}`}
								className="text-foreground/80 text-xs font-medium"
								decodeHtml
							>
								{String(entry.display_value ?? entry.value ?? '')}
							</Text>
						))}
					</View>
				</View>
			</View>
			<View className="w-20 items-end">
				{discounted ? (
					<Text className="text-muted-foreground/70 text-xs tabular-nums line-through">
						{format(originalUnit)}
					</Text>
				) : null}
				<Text className="text-muted-foreground text-sm tabular-nums">{format(unit)}</Text>
			</View>
			<View className="w-20 items-end">
				<Text className="text-foreground text-sm font-medium tabular-nums">{format(total)}</Text>
			</View>
		</View>
	);
}

function FeeRow({
	fee,
	format,
	t,
	last,
}: {
	fee: FeeLine;
	format: (n: number) => string;
	t: ReturnType<typeof useT>;
	last?: boolean;
}) {
	return (
		<View
			className={`flex-row items-center gap-3 py-2.5 ${last ? '' : 'border-border/60 border-b'}`}
		>
			<View className="w-8" />
			<View className="min-w-0 flex-1 flex-row items-center gap-2.5">
				<View className="bg-primary/10 h-7 w-7 items-center justify-center rounded">
					<Text className="text-primary text-base font-semibold">+</Text>
				</View>
				<View className="min-w-0 flex-1 gap-0.5">
					<Text className="text-foreground text-sm font-medium" decodeHtml>
						{fee.name || t('pos_cart.fees')}
					</Text>
					<Text className="text-muted-foreground text-xs">
						{t('pos_cart.fees')}
						{fee.tax_status === 'taxable' ? ` · ${t('common.taxable')}` : ''}
					</Text>
				</View>
			</View>
			<View className="w-20" />
			<View className="w-20 items-end">
				<Text className="text-foreground text-sm font-medium tabular-nums">
					{format(toNumber(fee.total))}
				</Text>
			</View>
		</View>
	);
}

/** The cart's column head: Qty · Item · Price · Total, in the cart's own words. */
function HeadRow({ t }: { t: ReturnType<typeof useT> }) {
	return (
		<View className="border-border flex-row gap-3 border-b pb-2">
			<View className="w-8">
				<Text className={TABLE_HEAD_TEXT}>{t('pos_cart.col_qty')}</Text>
			</View>
			<View className="min-w-0 flex-1">
				<Text className={TABLE_HEAD_TEXT}>{t('pos_cart.col_item')}</Text>
			</View>
			<View className="w-20 items-end">
				<Text className={TABLE_HEAD_TEXT}>{t('pos_cart.col_price')}</Text>
			</View>
			<View className="w-20 items-end">
				<Text className={TABLE_HEAD_TEXT}>{t('pos_cart.col_total')}</Text>
			</View>
		</View>
	);
}

export function LineItemsSection({ order }: { order: OrderPayload }) {
	const t = useT();
	const { format } = useCurrencyFormat({ currencySymbol: order.currency_symbol });
	const lineItems = order.line_items || [];
	const fees = order.fee_lines || [];

	if (!lineItems.length && !fees.length) {
		return (
			<Section title={t('orders.items')}>
				<Text className="text-muted-foreground">{t('orders.no_line_items')}</Text>
			</Section>
		);
	}

	return (
		<Section title={t('orders.items')}>
			<View>
				<HeadRow t={t} />
				{lineItems.map((item, index) => (
					<LineItemRow
						key={`${item.id ?? item.name ?? 'line-item'}-${index}`}
						item={item}
						format={format}
						t={t}
						last={fees.length === 0 && index === lineItems.length - 1}
					/>
				))}
				{fees.map((fee, index) => (
					<FeeRow
						key={`${fee.id ?? fee.name ?? 'fee'}-${index}`}
						fee={fee}
						format={format}
						t={t}
						last={index === fees.length - 1}
					/>
				))}
			</View>
		</Section>
	);
}
