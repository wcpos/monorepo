import * as React from 'react';
import { View } from 'react-native';

import { Card, CardContent, CardHeader, CardTitle } from '@wcpos/components/card';
import { Text } from '@wcpos/components/text';
import type { OrderDocument } from '@wcpos/database';

function getMetaValue(metaData: { key?: string; value?: unknown }[] | undefined, key: string) {
	const value = metaData?.find((item) => item.key === key)?.value;
	return value == null || value === '' ? undefined : String(value);
}

function Row({ label, value }: { label: string; value?: string }) {
	if (!value) return null;
	return (
		<View className="gap-1">
			<Text className="text-muted-foreground text-xs uppercase">{label}</Text>
			<Text>{value}</Text>
		</View>
	);
}

export function POSMetadataSection({ order }: { order: OrderDocument }) {
	const cashier = getMetaValue(order.meta_data, '_pos_user');
	const store = getMetaValue(order.meta_data, '_pos_store');

	if (!cashier && !store) return null;

	return (
		<Card>
			<CardHeader>
				<CardTitle>POS metadata</CardTitle>
			</CardHeader>
			<CardContent className="flex-row flex-wrap gap-6">
				<Row label="Cashier" value={cashier} />
				<Row label="Store" value={store} />
			</CardContent>
		</Card>
	);
}
