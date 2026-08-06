import * as React from 'react';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { getLogger } from '@wcpos/utils/logger';

import { useRestHttpClient } from '../../hooks/use-rest-http-client';
import { drainReceiptEmailQueue, type ReceiptEmailQueuePort, type ReceiptEmailRow } from './queue';
import { useReceiptEmailQueueCollection } from './use-receipt-email-queue-collection';

const logger = getLogger(['wcpos', 'receipt', 'emailQueue']);

/**
 * A pending row that ran out of backoff needs a nudge that no connectivity
 * event will provide. One minute is generous next to the 30s floor and costs a
 * local RxDB read; the drain itself stops at the first transport failure, so
 * this never turns into pressure on a struggling server.
 */
const DRAIN_INTERVAL_MS = 60_000;

/**
 * Drives the receipt-email queue (#165): drain on app start and on every
 * transition back to a reachable store, then keep a slow tick so a row waiting
 * out its backoff eventually goes.
 *
 * Renders nothing. Mounted once, near the top of the app, because the promise
 * made at the Send button has to be kept whether or not the receipt modal is
 * still open — or was ever opened again.
 */
export function ReceiptEmailQueueBridge() {
	const { status } = useOnlineStatus();
	const http = useRestHttpClient();
	const collection = useReceiptEmailQueueCollection();

	// Only a reachable STORE can take a send. 'online-website-unavailable' means
	// the device has a network and the store still does not answer.
	const online = status === 'online-website-available';

	const post = React.useCallback(
		(row: ReceiptEmailRow) =>
			http.post(`/orders/${row.orderId}/email`, {
				email: row.email,
				save_to: row.saveTo ?? '',
			}),
		[http]
	);

	React.useEffect(() => {
		if (!online || !collection) return;

		// Effect (last resort per project.mdc): the drain is an imperative side
		// effect on a schedule, with no value to render and no observable seam to
		// derive it from.
		let cancelled = false;
		const drain = () => {
			if (cancelled) return;
			void drainReceiptEmailQueue({
				collection: collection as unknown as ReceiptEmailQueuePort,
				post,
				logger,
			}).catch((error: unknown) => {
				logger.warn('Receipt email drain failed', {
					context: { error: error instanceof Error ? error.message : String(error) },
				});
			});
		};

		drain();
		const interval = setInterval(drain, DRAIN_INTERVAL_MS);
		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, [collection, online, post]);

	return null;
}
