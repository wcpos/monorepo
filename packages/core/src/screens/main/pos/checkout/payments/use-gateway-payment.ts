import * as React from 'react';

import cloneDeep from 'lodash/cloneDeep';

import { type AwaitingCustomerStamp, type DeclaredValues } from '@wcpos/order-math';
import { type EngineRecord, useQueryRuntime } from '@wcpos/query';

import { useStoreSession } from '../../../../../contexts/app-state';
import { patchEngineResident } from '../../../hooks/mutations/use-local-mutation';
import { useRestHttpClient } from '../../../hooks/use-rest-http-client';
import { refreshOrderRecord } from '../sale-completion';
import { cancelGatewayInvoice, submitGatewayPayment } from './submit-gateway-payment';

/**
 * Wire the gateway submit and cancel routes to the till: REST client, cashier identity and
 * the resident-only mirror (the server's answer is the truth; the order's own save is never
 * re-queued for it). Both calls need the order on the store: a gateway cannot run against
 * an order the server has not seen.
 */
export function useGatewayPayment() {
	const http = useRestHttpClient();
	const manager = useQueryRuntime();
	const { wpCredentials } = useStoreSession();

	const deps = React.useCallback(
		(order: EngineRecord<'orders'>, destination: string | null = null) => ({
			post: (url: string, body: unknown) => http.post(url, body),
			cashierId: wpCredentials.id ?? 0,
			destination,
			mirror: async (changes: { meta_data: unknown[]; status: string }) => {
				try {
					await patchEngineResident({
						manager,
						collection: 'orders',
						recordId: order.uuid,
						changes,
					});
				} catch (error) {
					// The store has already answered; only this till's copy is behind. Pull it.
					const id = order.getLatest().payload.id;
					if (id) await refreshOrderRecord(manager, id).catch(() => undefined);
					throw error;
				}
			},
		}),
		[http, manager, wpCredentials.id]
	);

	const gatewayOrder = (order: EngineRecord<'orders'>) => {
		const payload = order.getLatest().payload;
		if (!payload.id) throw new Error('order_not_on_store');
		// RxDB serves object fields as Proxies; the meta helpers need plain data.
		return { uuid: order.uuid, id: payload.id, meta_data: cloneDeep(payload.meta_data ?? []) };
	};

	const submit = React.useCallback(
		(
			order: EngineRecord<'orders'>,
			methodId: string,
			input: { attemptId: string; values: DeclaredValues; destination: string | null }
		) => submitGatewayPayment(gatewayOrder(order), methodId, input, deps(order, input.destination)),
		[deps]
	);
	const cancel = React.useCallback(
		(order: EngineRecord<'orders'>, stamp: AwaitingCustomerStamp) =>
			cancelGatewayInvoice(gatewayOrder(order), stamp, deps(order)),
		[deps]
	);
	return React.useMemo(() => ({ submit, cancel }), [submit, cancel]);
}
