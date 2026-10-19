import * as React from 'react';

import { useRouter } from 'expo-router';

import type { EngineRecord } from '@wcpos/query';
import { NO_STORE, POS_META_KEYS, wooMetaCarrier } from '@wcpos/sync-core';

import { useRegister } from '../../../services/register/use-register';
import { useStoreSession } from '../../../contexts/app-state';
import { useOrderRecord } from './commands/use-order-record';
import { useStorageMoneyPathGuard } from '../hooks/use-storage-health';

/**
 * Re-open an order at this till: status back to pos-open, cashier and store stamped on it,
 * then the cart. #163 ruling R5: with the worker dead that write cannot be recorded, and the
 * cart it lands in could not be checked out anyway, so a degraded store refuses at the door.
 */
export function useReopenOrder(order: EngineRecord<'orders'>) {
	const router = useRouter();
	const { reopenOrder } = useOrderRecord();
	const { store, wpCredentials, site } = useStoreSession();
	const register = useRegister();
	const { blockIfDegraded } = useStorageMoneyPathGuard();
	return React.useCallback(async () => {
		if (blockIfDegraded('save-order', { orderId: order.uuid })) return;
		const existingMeta = order.payload.meta_data ?? [];
		const existingStoreId = wooMetaCarrier.readIdentity(existingMeta).storeId;
		let meta_data = wooMetaCarrier.stampIdentity(existingMeta, {
			userId: wpCredentials.id!,
			tillId: register?.id,
			registerId: register?.sites[site.uuid!]?.register_id ?? undefined,
			storeId: store.id === NO_STORE ? (existingStoreId ?? NO_STORE) : store.id!,
		});
		if (store.id === NO_STORE && existingStoreId === null) {
			meta_data = meta_data.filter((entry) => entry.key !== POS_META_KEYS.store);
		}
		if (!(await reopenOrder(order, { status: 'pos-open', meta_data }))) return;
		if (blockIfDegraded('save-order', { orderId: order.uuid })) return;
		router.push({
			pathname: '/cart/[...orderId]',
			params: { orderId: order.uuid ? [order.uuid] : [] },
		});
	}, [
		blockIfDegraded,
		reopenOrder,
		router,
		order,
		store.id,
		wpCredentials.id,
		register,
		site.uuid,
	]);
}
