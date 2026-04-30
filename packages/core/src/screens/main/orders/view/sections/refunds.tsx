import * as React from 'react';
import { View } from 'react-native';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@wcpos/components/card';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@wcpos/components/table';
import { Text } from '@wcpos/components/text';

import { WCRefund } from '../use-order-refunds';

type OrderDocument = import('@wcpos/database').OrderDocument;

function formatMoney(value: unknown, currencySymbol?: string) {
	const num = typeof value === 'number' ? value : parseFloat(String(value ?? '0'));
	return Number.isFinite(num) ? `${currencySymbol ?? ''}${num.toFixed(2)}` : String(value ?? '—');
}

function formatDate(value?: string | null) {
	if (!value) return '—';
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? value
		: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

type LocalRefund = NonNullable<OrderDocument['refunds']>[number];

function RefundLineItems({
	refund,
	currencySymbol,
}: {
	refund: WCRefund;
	currencySymbol?: string;
}) {
	const lineItems = refund.line_items || [];
	if (!lineItems.length) return null;

	return (
		<View className="mt-3 gap-2">
			<Text className="font-medium">Refunded line items</Text>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="flex-[2]">
							<Text>Item</Text>
						</TableHead>
						<TableHead>
							<Text>Qty</Text>
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
								<Text>{item.name || item.sku || '—'}</Text>
							</TableCell>
							<TableCell>
								<Text>{item.quantity ?? '—'}</Text>
							</TableCell>
							<TableCell>
								<Text>{formatMoney(item.total_tax, currencySymbol)}</Text>
							</TableCell>
							<TableCell>
								<Text>{formatMoney(item.total, currencySymbol)}</Text>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</View>
	);
}

function TaxBreakdown({ refund, currencySymbol }: { refund: WCRefund; currencySymbol?: string }) {
	const taxes = refund.tax_lines || [];
	if (!taxes.length) return null;

	return (
		<View className="mt-3 gap-1">
			<Text className="font-medium">Tax breakdown</Text>
			{taxes.map((tax, index) => (
				<View key={`${tax.id || tax.label || index}`} className="flex-row justify-between gap-4">
					<Text className="text-muted-foreground">{tax.label || `Tax ${tax.id || index + 1}`}</Text>
					<Text>{formatMoney(tax.tax_total, currencySymbol)}</Text>
				</View>
			))}
		</View>
	);
}

export function RefundsSkeleton() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Refunds</CardTitle>
			</CardHeader>
			<CardContent className="gap-2">
				<View className="bg-muted h-4 w-1/3 rounded" />
				<View className="bg-muted h-4 w-2/3 rounded" />
			</CardContent>
		</Card>
	);
}

export function RefundsFallback({
	refunds,
	currencySymbol,
	onRetry,
}: {
	refunds?: LocalRefund[];
	currencySymbol?: string;
	onRetry: () => void;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Refunds</CardTitle>
			</CardHeader>
			<CardContent className="gap-3">
				<Text className="text-destructive">Could not load refund details.</Text>
				{refunds?.length ? (
					<View className="gap-2">
						<Text className="text-muted-foreground">Local refund summary:</Text>
						{refunds.map((refund, index) => (
							<View key={`${refund.id || index}`} className="border-border rounded-md border p-3">
								<Text>#{refund.id || '—'}</Text>
								<Text className="text-muted-foreground">
									{refund.reason || 'No reason provided'}
								</Text>
								<Text>{formatMoney(refund.total, currencySymbol)}</Text>
							</View>
						))}
					</View>
				) : (
					<Text className="text-muted-foreground">No local refund summaries are available.</Text>
				)}
				<Button variant="outline" onPress={onRetry} className="self-start">
					<ButtonText>Retry</ButtonText>
				</Button>
			</CardContent>
		</Card>
	);
}

function RefundsDetail({
	order,
	resource,
}: {
	order: OrderDocument;
	resource: ObservableResource<WCRefund[]>;
}) {
	const refunds = useObservableSuspense(resource);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Refunds</CardTitle>
			</CardHeader>
			<CardContent className="gap-4">
				{refunds.length ? (
					refunds.map((refund, index) => (
						<View key={`${refund.id || index}`} className="border-border rounded-md border p-4">
							<View className="flex-row flex-wrap justify-between gap-4">
								<View>
									<Text className="font-semibold">Refund #{refund.id || '—'}</Text>
									<Text className="text-muted-foreground">{formatDate(refund.date_created)}</Text>
								</View>
								<View>
									<Text className="text-right font-semibold">
										{formatMoney(refund.total, order.currency_symbol)}
									</Text>
									<Text className="text-muted-foreground text-right">
										By {refund.refunded_by || '—'}
									</Text>
								</View>
							</View>
							<Text className="mt-2">{refund.reason || 'No reason provided'}</Text>
							<RefundLineItems refund={refund} currencySymbol={order.currency_symbol} />
							<TaxBreakdown refund={refund} currencySymbol={order.currency_symbol} />
						</View>
					))
				) : (
					<Text className="text-muted-foreground">No refunds for this order.</Text>
				)}
			</CardContent>
		</Card>
	);
}

export function RefundsSection({
	order,
	resource,
}: {
	order: OrderDocument;
	resource?: ObservableResource<WCRefund[]>;
}) {
	if (!order.id) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Refunds</CardTitle>
				</CardHeader>
				<CardContent>
					<Text className="text-muted-foreground">No refunds for this order.</Text>
				</CardContent>
			</Card>
		);
	}

	if (!resource) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Refunds</CardTitle>
				</CardHeader>
				<CardContent>
					<Text className="text-muted-foreground">No refunds for this order.</Text>
				</CardContent>
			</Card>
		);
	}

	return <RefundsDetail order={order} resource={resource} />;
}
