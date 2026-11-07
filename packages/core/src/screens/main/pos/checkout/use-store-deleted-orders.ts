import * as React from 'react';

import { observeQueueRows, REJECTED_QUEUE_STATUSES, useQueryRuntime } from '@wcpos/query';
import { findEngineResident, rebirthEngineResident, residentPayload } from '@wcpos/query/mutations';
import { isRecordGoneRejection, OPEN_CART_ORDER_STATUS } from '@wcpos/sync-engine';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../../contexts/translations';

const log = getLogger(['wcpos', 'pos', 'checkout', 'store-deleted-order']);

export function useStoreDeletedOrdersSettler(storeId: number | string | undefined): void {
	const manager = useQueryRuntime();
	const t = useT();
	// Like the rejection mirror, re-subscribe after the same-engine store switch commits.
	React.useEffect(() => {
		const handled = new Set<string>();
		const inFlight = new Set<string>();
		const subscription = observeQueueRows(manager.engine, {
			statuses: REJECTED_QUEUE_STATUSES,
			collectionName: 'orders',
		}).subscribe((rows) => {
			for (const row of rows) {
				if (
					row.operation !== 'update' ||
					!isRecordGoneRejection(row.rejectedStatus, row.rejectedReason) ||
					handled.has(row.mutationId) ||
					inFlight.has(row.recordId)
				)
					continue;
				handled.add(row.mutationId);
				inFlight.add(row.recordId);
				void (async () => {
					const { recordId, mutationId } = row;
					try {
						const resident = await findEngineResident(manager, 'orders', recordId);
						const { number, status } = resident ? residentPayload(resident) : {};
						const recreate = resident && status === OPEN_CART_ORDER_STATUS;
						if (recreate) await rebirthEngineResident({ manager, collection: 'orders', recordId });
						await manager.engine.resolveConflict(mutationId, 'discard');
						if (recreate) {
							const reborn = await findEngineResident(manager, 'orders', recordId);
							if (!reborn)
								throw new Error(`Engine resident "${recordId}" is missing after rebirth`);
							// Plain snapshot, not an RxDB payload proxy: it crosses the storage worker boundary.
							await manager.engine.write({
								collection: 'orders',
								operation: 'create',
								recordId,
								payload: residentPayload(reborn),
							});
						}
						if (!resident) return;
						log.warn('Order deleted on the store', {
							code: ERROR_CODES.RECORD_GONE_ON_STORE,
							showToast: true,
							toast: {
								title: t('pos_checkout.order_deleted_on_store'),
								...(number
									? {
											description: recreate
												? t('pos_checkout.order_deleted_on_store_recreated', { number })
												: t('pos_checkout.order_deleted_on_store_removed', { number }),
										}
									: {}),
							},
							context: {
								orderId: recordId,
								orderNumber: number,
								mutationId,
								outcome: recreate ? 'recreated' : 'removed',
							},
						});
					} catch (error) {
						log.error('Could not settle the store-deleted order', {
							code: ERROR_CODES.RECORD_REJECTED,
							context: { orderId: recordId, mutationId, error: getErrorMessage(error) },
						});
					} finally {
						inFlight.delete(recordId);
					}
				})();
			}
		});
		return () => subscription.unsubscribe();
	}, [manager, storeId, t]);
}
