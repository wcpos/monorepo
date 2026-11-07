import * as React from 'react';

import { observeQueueRows, REJECTED_QUEUE_STATUSES, useQueryRuntime } from '@wcpos/query';
import { findEngineResident, rebirthOrderResident, residentPayload } from '@wcpos/query/mutations';
import { OPEN_CART_ORDER_STATUS, type QueueRow } from '@wcpos/sync-engine';
import { isRecordGoneRejection } from '@wcpos/utils/logger/rejected-write-code';
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
		let latestRows: readonly QueueRow[] = [];
		const failed = new Set<string>();
		const scan = () => {
			for (const row of latestRows) {
				if (
					row.operation !== 'update' ||
					!isRecordGoneRejection(row.rejectedStatus, row.rejectedReason) ||
					handled.has(row.mutationId) ||
					failed.has(row.mutationId) ||
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
						const alreadyReborn = resident?.toJSON().remoteId === null;
						const reborn = recreate ? await rebirthOrderResident(manager, recordId) : null;
						await manager.engine.resolveConflict(mutationId, 'discard');
						if (reborn) {
							// Plain snapshot, not an RxDB payload proxy: it crosses the storage worker boundary.
							await manager.engine.write({
								collection: 'orders',
								operation: 'create',
								recordId,
								payload: residentPayload(reborn),
							});
						}
						if (!resident || alreadyReborn) return;
						log.warn('Order deleted on the store', {
							code: ERROR_CODES.RECORD_GONE_ON_STORE,
							showToast: true,
							toast: {
								title: t('pos_checkout.order_deleted_on_store'),
								...(number
									? {
											text2: recreate
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
						handled.delete(mutationId);
						failed.add(mutationId); // Retry on an emission, not in the finally rescan.
						log.error('Could not settle the store-deleted order', {
							code: ERROR_CODES.RECORD_REJECTED,
							showToast: true,
							toast: {
								title: t('pos_checkout.order_refused'),
								text2: getErrorMessage(error),
							},
							context: { orderId: recordId, mutationId, error: getErrorMessage(error) },
						});
					} finally {
						inFlight.delete(recordId);
						scan();
					}
				})();
			}
		};
		const subscription = observeQueueRows(manager.engine, {
			statuses: REJECTED_QUEUE_STATUSES,
			collectionName: 'orders',
		}).subscribe((rows) => {
			latestRows = rows;
			failed.clear();
			scan();
		});
		return () => {
			latestRows = [];
			subscription.unsubscribe();
		};
	}, [manager, storeId, t]);
}
