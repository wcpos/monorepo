import * as React from 'react';
import { View } from 'react-native';

import { Card, CardContent, CardHeader, CardTitle } from '@wcpos/components/card';
import { Text } from '@wcpos/components/text';
import type { OrderDocument } from '@wcpos/database';

type Address = NonNullable<OrderDocument['billing']> | NonNullable<OrderDocument['shipping']>;

function addressLines(address?: Address) {
	if (!address) return [];
	return [
		[address.first_name, address.last_name].filter(Boolean).join(' '),
		address.company,
		address.address_1,
		address.address_2,
		[address.city, address.state, address.postcode].filter(Boolean).join(', '),
		address.country,
		'email' in address ? address.email : undefined,
		address.phone,
	].filter(Boolean) as string[];
}

function AddressBlock({ title, address }: { title: string; address?: Address }) {
	const lines = addressLines(address);
	return (
		<View className="min-w-64 flex-1 gap-1">
			<Text className="font-medium">{title}</Text>
			{lines.length ? (
				lines.map((line, index) => (
					<Text key={`${line}-${index}`} className="text-muted-foreground">
						{line}
					</Text>
				))
			) : (
				<Text className="text-muted-foreground">—</Text>
			)}
		</View>
	);
}

function sameAddress(order: OrderDocument) {
	return addressLines(order.billing).join('\n') === addressLines(order.shipping).join('\n');
}

export function CustomerSection({ order }: { order: OrderDocument }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Customer</CardTitle>
			</CardHeader>
			<CardContent className="gap-4">
				<View className="flex-row flex-wrap gap-6">
					<AddressBlock title="Billing address" address={order.billing} />
					{!sameAddress(order) && (
						<AddressBlock title="Shipping address" address={order.shipping} />
					)}
				</View>
				{order.customer_note ? (
					<View className="gap-1">
						<Text className="font-medium">Customer note</Text>
						<Text className="text-muted-foreground">{order.customer_note}</Text>
					</View>
				) : null}
			</CardContent>
		</Card>
	);
}
