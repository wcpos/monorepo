import * as React from 'react';
import { View } from 'react-native';

import { Card, CardContent, CardHeader, CardTitle } from '@wcpos/components/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { Icon } from '@wcpos/components/icon';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@wcpos/components/table';
import { Text } from '@wcpos/components/text';

type OrderDocument = import('@wcpos/database').OrderDocument;

function formatMoney(value: unknown, currencySymbol?: string) {
	const num = typeof value === 'number' ? value : parseFloat(String(value ?? '0'));
	return Number.isFinite(num) ? `${currencySymbol ?? ''}${num.toFixed(2)}` : String(value ?? '—');
}
type LineItem = NonNullable<OrderDocument['line_items']>[number];

function LineItemMeta({ item }: { item: LineItem }) {
	const meta = item.meta_data || [];
	if (!meta.length) return null;

	return (
		<Collapsible>
			<CollapsibleTrigger className="mt-2 flex-row items-center gap-1">
				<Icon name="chevronDown" size="xs" />
				<Text className="text-muted-foreground text-xs">Metadata</Text>
			</CollapsibleTrigger>
			<CollapsibleContent className="mt-2 gap-1">
				{meta.map((entry, index) => (
					<Text key={`${entry.id || entry.key || index}`} className="text-muted-foreground text-xs">
						{entry.display_key || entry.key}: {entry.display_value || String(entry.value ?? '')}
					</Text>
				))}
			</CollapsibleContent>
		</Collapsible>
	);
}

export function LineItemsSection({ order }: { order: OrderDocument }) {
	const lineItems = order.line_items || [];

	return (
		<Card>
			<CardHeader>
				<CardTitle>Line items</CardTitle>
			</CardHeader>
			<CardContent>
				{lineItems.length ? (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="flex-[2]">
									<Text>Item</Text>
								</TableHead>
								<TableHead>
									<Text>SKU</Text>
								</TableHead>
								<TableHead>
									<Text>Qty</Text>
								</TableHead>
								<TableHead>
									<Text>Unit</Text>
								</TableHead>
								<TableHead>
									<Text>Tax</Text>
								</TableHead>
								<TableHead>
									<Text>Total</Text>
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{lineItems.map((item, index) => (
								<TableRow key={`${item.id || item.name || index}`} index={index}>
									<TableCell className="flex-[2]">
										<View>
											<Text>{item.name || '—'}</Text>
											<LineItemMeta item={item} />
										</View>
									</TableCell>
									<TableCell>
										<Text>{item.sku || '—'}</Text>
									</TableCell>
									<TableCell>
										<Text>{item.quantity ?? '—'}</Text>
									</TableCell>
									<TableCell>
										<Text>{formatMoney(item.price, order.currency_symbol)}</Text>
									</TableCell>
									<TableCell>
										<Text>{formatMoney(item.total_tax, order.currency_symbol)}</Text>
									</TableCell>
									<TableCell>
										<Text>{formatMoney(item.total, order.currency_symbol)}</Text>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				) : (
					<Text className="text-muted-foreground">No line items.</Text>
				)}
			</CardContent>
		</Card>
	);
}
