import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@wcpos/components/text';
import type { EngineRecord } from '@wcpos/query';
import { wooMetaCarrier } from '@wcpos/sync-core';

import { RailSection } from './_section';
import { useT } from '../../../../../contexts/translations';
import { useCashierLabel } from '../../../hooks/use-cashier-label';
import { useStoreLabel } from '../../../hooks/use-store-label';

type OrderPayload = EngineRecord<'orders'>['payload'];

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

export function POSMetadataSection({ order, last }: { order: OrderPayload; last?: boolean }) {
	const t = useT();
	const { cashierId, storeId } = wooMetaCarrier.readIdentity(order.meta_data);
	const cashierID = cashierId ?? undefined;
	const cashier = useCashierLabel(cashierID).label;
	const storeID = storeId ?? undefined;
	const store = useStoreLabel(storeID).label;
	const createdVia = order.created_via;

	if (!cashier && !store && !createdVia && !order.id) return null;

	return (
		<RailSection title={t('orders.metadata')} last={last}>
			{order.id ? <KV k={t('orders.order_id')} v={String(order.id)} /> : null}
			<KV k={t('common.cashier')} v={cashier} />
			<KV k={t('common.store')} v={store} />
			<KV k={t('common.created_via_2')} v={createdVia} />
		</RailSection>
	);
}
