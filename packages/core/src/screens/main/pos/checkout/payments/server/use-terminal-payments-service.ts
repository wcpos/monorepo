import * as React from 'react';

import cloneDeep from 'lodash/cloneDeep';

import { readLedger, upsertPaymentRow, withLedger } from '@wcpos/order-math';
import type { MetaDataEntry } from '@wcpos/order-math';
import { useQueryRuntime } from '@wcpos/query';

import { useStoreSession } from '../../../../../../contexts/app-state';
import {
	getTerminalPaymentsService,
	startTerminalPaymentsService,
	stopTerminalPaymentsService,
} from '../../../../../../services/terminal-payments';
import {
	findEngineResident,
	patchEngineResident,
} from '../../../../hooks/mutations/use-local-mutation';
import { useRestHttpClient } from '../../../../hooks/use-rest-http-client';
import { enterReceipt } from '../../checkout-mode';

export function useTerminalPaymentsService(): void {
	const { store, site } = useStoreSession();
	const http = useRestHttpClient();
	const manager = useQueryRuntime();
	const latestHttp = React.useRef(http);
	const bindingRef = React.useRef<{
		store: typeof store;
		site: typeof site;
		client: typeof http;
	} | null>(null);
	// Refresh credentials without restarting legs or binding an old store to a new client's routes.
	React.useLayoutEffect(() => {
		latestHttp.current = http;
		const binding = bindingRef.current;
		if (binding?.store === store && binding.site === site) binding.client = http;
	}, [http, store, site]);
	// The singleton belongs to the external store session, not whichever order is visible.
	React.useEffect(() => {
		const binding = { store, site, client: latestHttp.current };
		bindingRef.current = binding;
		let stopped = false;
		const service = startTerminalPaymentsService({
			http: {
				get: (url) => binding.client.get(url),
				post: (url, body) => binding.client.post(url, body),
			},
			mirror: async (orderUuid, { payment, order }) => {
				const resident = await findEngineResident(manager, 'orders', orderUuid);
				if (stopped) return;
				if (!resident) throw new Error('Terminal payment order is not resident');
				const payload = resident.getLatest?.().payload ?? resident.payload;
				const meta = cloneDeep((payload as { meta_data?: MetaDataEntry[] }).meta_data ?? []);
				await patchEngineResident({
					manager,
					collection: 'orders',
					recordId: orderUuid,
					// Only the summary fields that are order fields: `paid` and `balance` are
					// derived from the ledger on read, and an unknown key fails the schema.
					changes: {
						...(order
							? {
									status: order.status,
									payment_method: order.payment_method,
									payment_method_title: order.payment_method_title,
								}
							: {}),
						meta_data: withLedger(meta, upsertPaymentRow(readLedger(meta), payment)),
					},
				});
			},
			onCaptured: (orderUuid, order) => {
				// Never select: the order the cashier is serving stays on screen. When
				// the captured order IS the current one, the tender flow's own outcome
				// handler runs the complete-order flow, which selects the receipt.
				if (!stopped && order && Number(order.balance) === 0)
					enterReceipt(orderUuid, { select: false });
			},
		});
		return () => {
			stopped = true;
			if (bindingRef.current === binding) bindingRef.current = null;
			if (getTerminalPaymentsService() === service) stopTerminalPaymentsService();
		};
	}, [store, site, manager]);
}
