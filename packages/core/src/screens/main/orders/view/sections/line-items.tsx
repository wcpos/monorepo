import * as React from 'react';
import { View } from 'react-native';

import { Image } from '@wcpos/components/image';
import { Text } from '@wcpos/components/text';

import { formatMoney } from './_format';
import { Section } from './_section';

type OrderDocument = import('@wcpos/database').OrderDocument;
type LineItem = NonNullable<OrderDocument['line_items']>[number];
type FeeLine = NonNullable<OrderDocument['fee_lines']>[number];

function getMetaValue(
	metaData: { key?: string; value?: unknown; display_value?: unknown }[] | undefined
) {
	return (metaData || []).filter((entry) => entry.key && !String(entry.key).startsWith('_'));
}

function asFloat(value: unknown) {
	const n = parseFloat(String(value ?? '0'));
	return Number.isFinite(n) ? n : 0;
}

function LineItemRow({ item, currencySymbol }: { item: LineItem; currencySymbol?: string }) {
	const subtotal = asFloat(item.subtotal);
	const total = asFloat(item.total);
	const discounted = subtotal > total;
	const qty = item.quantity ?? 0;
	const unit = qty > 0 ? subtotal / qty : asFloat(item.price);
	const variations = getMetaValue(item.meta_data);

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
						<Text key={`${entry.key ?? 'meta'}-${index}`} className="text-muted-foreground text-xs">
							<Text className="text-foreground/80 text-xs font-medium">
								{String(entry.display_value ?? entry.value ?? '')}
							</Text>
						</Text>
					))}
				</View>
			</View>
			<View className="min-w-[88px] items-end">
				<View className="flex-row items-baseline gap-1">
					{discounted ? (
						<Text className="text-muted-foreground/70 text-xs tabular-nums line-through">
							{formatMoney(subtotal / Math.max(qty, 1), currencySymbol)}
						</Text>
					) : null}
					<Text className="text-muted-foreground text-xs tabular-nums">
						{qty} × {formatMoney(unit, currencySymbol)}
					</Text>
				</View>
				<Text className="text-foreground text-sm font-medium tabular-nums">
					{formatMoney(total, currencySymbol)}
				</Text>
				{discounted ? (
					<View className="bg-success/10 mt-0.5 rounded px-1.5 py-0.5">
						<Text className="text-success text-[10px] font-medium tabular-nums">
							saved {formatMoney(subtotal - total, currencySymbol)}
						</Text>
					</View>
				) : null}
			</View>
		</View>
	);
}

function FeeRow({ fee, currencySymbol }: { fee: FeeLine; currencySymbol?: string }) {
	return (
		<View className="border-border/60 flex-row gap-3 border-b py-3">
			<View className="bg-primary/10 h-11 w-11 items-center justify-center rounded">
				<Text className="text-primary text-base font-semibold">+</Text>
			</View>
			<View className="min-w-0 flex-1 gap-1">
				<Text className="text-foreground text-sm font-medium">{fee.name || 'Fee'}</Text>
				<Text className="text-muted-foreground text-xs">
					Fee
					{fee.tax_status === 'taxable' ? ' · Taxable' : ''}
				</Text>
			</View>
			<View className="min-w-[88px] items-end">
				<Text className="text-muted-foreground text-xs">—</Text>
				<Text className="text-foreground text-sm font-medium tabular-nums">
					{formatMoney(fee.total, currencySymbol)}
				</Text>
			</View>
		</View>
	);
}

export function LineItemsSection({ order }: { order: OrderDocument }) {
	const lineItems = order.line_items || [];
	const fees = order.fee_lines || [];

	if (!lineItems.length && !fees.length) {
		return (
			<Section title="Items">
				<Text className="text-muted-foreground">No line items.</Text>
			</Section>
		);
	}

	return (
		<Section title="Items">
			<View>
				{lineItems.map((item, index) => (
					<LineItemRow
						key={`${item.id ?? item.name ?? 'line-item'}-${index}`}
						item={item}
						currencySymbol={order.currency_symbol}
					/>
				))}
				{fees.map((fee, index) => (
					<FeeRow
						key={`${fee.id ?? fee.name ?? 'fee'}-${index}`}
						fee={fee}
						currencySymbol={order.currency_symbol}
					/>
				))}
			</View>
		</Section>
	);
}
