import * as React from 'react';

import { getLogger } from '@wcpos/utils/logger';

import { useStorageMoneyPathGuard } from './use-storage-health';
import { useT } from '../../../contexts/translations';
import { reportPushFailure } from '../contexts/push-failure-code';
import { usePushDocument } from '../contexts/use-push-document';

import type { CurrentOrderRecord } from '../pos/contexts/current-order';

const syncLogger = getLogger(['wcpos', 'orders', 'sync']);

/** The cart's current order (temporary or stored); a stored `EngineRecord<'orders'>` is one of them. */
export function useSyncOrder(record: CurrentOrderRecord, onBeforePush?: () => Promise<boolean>) {
	const pushDocument = usePushDocument();
	const [loading, setLoading] = React.useState(false);
	const t = useT();
	const { storageDegraded, blockIfDegraded } = useStorageMoneyPathGuard();

	/**
	 *
	 */
	const sync = React.useCallback(async () => {
		// #163 ruling R5: an order save that cannot reach local storage leaves the
		// cashier with a "saved" order that exists nowhere on this device.
		if (
			blockIfDegraded('save-order', {
				orderId: record.uuid ?? record.payload.id,
			})
		) {
			return;
		}

		setLoading(true);
		try {
			if (onBeforePush && !(await onBeforePush())) return;
			await pushDocument(record).then((savedDoc) => {
				/**
				 * TODO; move this generic sanckbar to the pushDocument hook
				 */
				if (savedDoc) {
					const saved = record.getLatest().payload;
					syncLogger.success(t('pos_cart.order_synced', { number: saved.number }), {
						showToast: true,
						context: {
							orderId: saved.id,
							orderNumber: saved.number,
						},
					});
				}
			});
		} catch (error) {
			reportPushFailure(syncLogger, 'Failed to save order', error, {
				title: t('common.failed_to_save_order'),
				stillSendingTitle: t('common.order_still_sending'),
				context: { orderId: record.payload.id },
			});
		} finally {
			setLoading(false);
		}
	}, [blockIfDegraded, record, onBeforePush, pushDocument, t]);

	return { sync, loading, disabled: loading || storageDegraded };
}
