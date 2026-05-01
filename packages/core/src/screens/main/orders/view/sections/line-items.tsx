import * as React from 'react';
import { View } from 'react-native';

import toNumber from 'lodash/toNumber';

import { Image } from '@wcpos/components/image';
import { Text } from '@wcpos/components/text';

import { Section } from './_section';
import { useT } from '../../../../../contexts/translations';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';

type OrderDocument = import('@wcpos/database').OrderDocument;
type LineItem = NonNullable<OrderDocument['line_items']>[number];
type FeeLine = NonNullable<OrderDocument['fee_lines']>[number];

function visibleMeta(metaData: LineItem['meta_data']) {
	return (metaData || []).filter((entry) => entry.key && !String(entry.key).startsWith('_'));
}

function LineItemRow({
	item,
	format,
	t,
}: {
	item: LineItem;
	format: (n: number) => string;
	t: ReturnType<typeof useT>;
}) {
	const subtotal = toNumber(item.subtotal);
	const total = toNumber(item.total);
	const discounted = subtotal > total;
	const qty = item.quantity ?? 0;
	const originalUnit = qty > 0 ? subtotal / qty : toNumber(item.price);
	const unit = qty > 0 ? (discounted ? total / qty : subtotal / qty) : toNumber(item.price);
	const variations = visibleMeta(item.meta_data);

	return (
		<View className="border-border/60 flex-row gap-3 border-b py-3">
			<View className="bg-muted h-11 w-11 overflow-hidden rounded">
				{item.image?.src ? <Image source={{ uri: item.image.src }} className="h-11 w-11" /> : null}
			</View>
			<View className="min-w-0 flex-1 gap-1">
				<Text className="text-foreground text-sm font-medium" numberOfLines={2}>
					{item.name || '—'}
				</Text>
				{item.parent_name && item.parent_name !== item.name ? (
					<Text className="text-muted-foreground text-xs">{item.parent_name}</Text>
				) : null}
				<View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
					{item.sku ? (
						<View className="bg-primary/10 rounded px-1.5 py-0.5">
							<Text className="text-primary text-[10px] font-medium tabular-nums">{item.sku}</Text>
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
			<View className="min-w-[88px] items-end">
				<View className="flex-row items-baseline gap-1">
					{discounted ? (
						<Text className="text-muted-foreground/70 text-xs tabular-nums line-through">
							{format(originalUnit)}
						</Text>
					) : null}
					<Text className="text-muted-foreground text-xs tabular-nums">
						{qty} × {format(unit)}
					</Text>
				</View>
				<Text className="text-foreground text-sm font-medium tabular-nums">{format(total)}</Text>
				{discounted ? (
					<View className="bg-success/10 mt-0.5 rounded px-1.5 py-0.5">
						<Text className="text-success text-[10px] font-medium tabular-nums">
							{t('common.saved', { defaultValue: 'saved' })} {format(subtotal - total)}
						</Text>
					</View>
				) : null}
			</View>
		</View>
	);
}

function FeeRow({
	fee,
	format,
	t,
}: {
	fee: FeeLine;
	format: (n: number) => string;
	t: ReturnType<typeof useT>;
}) {
	return (
		<View className="border-border/60 flex-row gap-3 border-b py-3">
			<View className="bg-primary/10 h-11 w-11 items-center justify-center rounded">
				<Text className="text-primary text-base font-semibold">+</Text>
			</View>
			<View className="min-w-0 flex-1 gap-1">
				<Text className="text-foreground text-sm font-medium">
					{fee.name || t('pos_cart.fees')}
				</Text>
				<Text className="text-muted-foreground text-xs">
					{t('pos_cart.fees')}
					{fee.tax_status === 'taxable' ? ` · ${t('common.taxable')}` : ''}
				</Text>
			</View>
			<View className="min-w-[88px] items-end">
				<Text className="text-muted-foreground text-xs">—</Text>
				<Text className="text-foreground text-sm font-medium tabular-nums">
					{format(toNumber(fee.total))}
				</Text>
			</View>
		</View>
	);
}

export function LineItemsSection({ order }: { order: OrderDocument }) {
	const t = useT();
	const { format } = useCurrencyFormat({ currencySymbol: order.currency_symbol });
	const lineItems = order.line_items || [];
	const fees = order.fee_lines || [];

	if (!lineItems.length && !fees.length) {
		return (
			<Section title={t('orders.items', { defaultValue: 'Items' })}>
				<Text className="text-muted-foreground">
					{t('orders.no_line_items', { defaultValue: 'No line items.' })}
				</Text>
			</Section>
		);
	}

	return (
		<Section title={t('orders.items', { defaultValue: 'Items' })}>
			<View>
				{lineItems.map((item, index) => (
					<LineItemRow
						key={`${item.id ?? item.name ?? 'line-item'}-${index}`}
						item={item}
						format={format}
						t={t}
					/>
				))}
				{fees.map((fee, index) => (
					<FeeRow key={`${fee.id ?? fee.name ?? 'fee'}-${index}`} fee={fee} format={format} t={t} />
				))}
			</View>
		</Section>
	);
}
