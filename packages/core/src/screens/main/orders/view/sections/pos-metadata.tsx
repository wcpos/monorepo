import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@wcpos/components/text';

import { RailSection } from './_section';

type OrderDocument = import('@wcpos/database').OrderDocument;

function getMetaValue(metaData: { key?: string; value?: unknown }[] | undefined, key: string) {
	const value = metaData?.find((item) => item.key === key)?.value;
	return value == null || value === '' ? undefined : String(value);
}

function KV({ k, v }: { k: string; v?: string }) {
	if (!v) return null;
	return (
		<View className="flex-row items-baseline justify-between gap-3 py-1">
			<Text className="text-muted-foreground text-xs">{k}</Text>
			<Text className="text-foreground text-xs font-medium" numberOfLines={1}>
				{v}
			</Text>
		</View>
	);
}

export function POSMetadataSection({ order, last }: { order: OrderDocument; last?: boolean }) {
	const cashier = getMetaValue(order.meta_data, '_pos_user');
	const store = getMetaValue(order.meta_data, '_pos_store');
	const channel = order.created_via;

	if (!cashier && !store && !channel && !order.id) return null;

	return (
		<RailSection title="Metadata" last={last}>
			{order.id ? <KV k="Order ID" v={String(order.id)} /> : null}
			<KV k="Cashier" v={cashier} />
			<KV k="Store" v={store} />
			<KV k="Channel" v={channel} />
		</RailSection>
	);
}
