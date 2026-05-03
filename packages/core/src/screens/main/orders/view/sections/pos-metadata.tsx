import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@wcpos/components/text';

import { RailSection } from './_section';
import { useT } from '../../../../../contexts/translations';
import { useCashierLabel } from '../../../hooks/use-cashier-label';
import { useStoreLabel } from '../../../hooks/use-store-label';

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
	const t = useT();
	const cashierID = getMetaValue(order.meta_data, '_pos_user');
	const cashier = useCashierLabel(cashierID).label;
	const storeID = getMetaValue(order.meta_data, '_pos_store');
	const store = useStoreLabel(storeID).label;
	const createdVia = order.created_via;

	if (!cashier && !store && !createdVia && !order.id) return null;

	return (
		<RailSection title={t('orders.metadata', { defaultValue: 'Metadata' })} last={last}>
			{order.id ? (
				<KV k={t('orders.order_id', { defaultValue: 'Order ID' })} v={String(order.id)} />
			) : null}
			<KV k={t('common.cashier')} v={cashier} />
			<KV k={t('common.store')} v={store} />
			<KV k={t('common.created_via_2')} v={createdVia} />
		</RailSection>
	);
}
