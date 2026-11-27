import * as React from 'react';

import { firstValueFrom, race, timer } from 'rxjs';

import { useQueryRuntime } from '@wcpos/query';
import { resolveQueuedChange } from '@wcpos/query/mutations';
import { ORDER_REFRESH_TIMEOUT_MS, readResidentOrder } from '@wcpos/query/record-readers';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import type { EngineEvent } from '@wcpos/sync-engine';

import { useT } from '../../../contexts/translations';

const logger = getLogger(['wcpos', 'orders']);
// Several queued writes can hit the same refund; show one notice for the order in this window.
const NOTICE_WINDOW_MS = 10_000;

export function TaxLocationLockedBridge() {
	const runtime = useQueryRuntime();
	const t = useT();
	const notices = React.useRef(new Map<string, number>());
	React.useEffect(() => {
		const handle = async (event: EngineEvent) => {
			if (event.type !== 'write-rejected' || event.collection !== 'orders') return;
			if (event.reason !== 'wcpos_tax_location_locked') return;
			const { recordId, mutationId } = event;
			const now = Date.now();
			if ((notices.current.get(recordId) ?? -Infinity) + NOTICE_WINDOW_MS <= now) {
				notices.current.set(recordId, now);
				const message = t('pos_cart.tax_location_locked');
				logger.warn(message, { showToast: true, toast: { type: 'error' } });
			}
			try {
				await resolveQueuedChange(runtime.engine, mutationId, 'discard');
				const wooId = (await readResidentOrder(runtime, recordId))?.payload.id;
				if (wooId)
					await firstValueFrom(
						race(runtime.engine.orderRevision.readopt(wooId), timer(ORDER_REFRESH_TIMEOUT_MS))
					);
			} catch (error) {
				logger.warn('Could not recover a refused tax address change', {
					context: { mutationId, error: getErrorMessage(error) },
				});
			}
		};
		return runtime.engine.events((event) => void handle(event));
	}, [runtime, t]);
	return null;
}
