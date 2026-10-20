import * as React from 'react';

import cloneDeep from 'lodash/cloneDeep';

import {
	type AwaitingCustomerStamp,
	type DeclaredValues,
	withAwaitingCustomer,
} from '@wcpos/order-math';
import {
	type EngineRecord,
	moneyCommandPoster,
	type OrderApproval,
	useQueryRuntime,
} from '@wcpos/query';
import { mirrorServerOrder } from '@wcpos/query/mutations';

import { useStoreSession } from '../../../../../contexts/app-state';
import { useRestHttpClient } from '../../../hooks/use-rest-http-client';
import { commandProvenance } from '../provenance/command-provenance';
import { refreshOrderRecord } from '../sale-completion';
import { cancelGatewayInvoice, submitGatewayPayment } from './submit-gateway-payment';

/**
 * Wire the gateway submit and cancel routes to the till: the money command poster (journal,
 * revision, approval), cashier identity and the resident-only mirror (the server's answer is the
 * truth; the order's own save is never re-queued for it). Both calls need the order on the store:
 * a gateway cannot run against an order the server has not seen.
 */
export function useGatewayPayment() {
	const http = useRestHttpClient();
	const manager = useQueryRuntime();
	const { wpCredentials, storeDB, userDB, site, store } = useStoreSession();
	const ctx = React.useMemo(
		() => ({ userDB, siteUuid: site.uuid ?? '', storeId: store.id }),
		[userDB, site.uuid, store.id]
	);

	const deps = React.useCallback(
		(
			order: EngineRecord<'orders'>,
			options: { destination?: string | null; approval?: OrderApproval; sessionId?: string | null }
		) => {
			const payload = order.getLatest().payload;
			const post = moneyCommandPoster({
				runtime: manager,
				storeDB,
				orderUuid: order.uuid,
				post: (url, body) => http.post(url, body),
				// A cancel is never approval-checked; a submit carries the cashier's press.
				approval: options.approval ?? {
					total: String(payload.total ?? ''),
					currency: payload.currency ?? '',
				},
				provenance: () => commandProvenance(ctx, order, options.sessionId ?? null),
			});
			return {
				post,
				cashierId: wpCredentials.id ?? 0,
				destination: options.destination ?? null,
				mirror: async ({
					payment,
					order: summary,
					awaiting,
				}: Parameters<Parameters<typeof submitGatewayPayment>[3]['mirror']>[0]) => {
					try {
						await mirrorServerOrder(manager, order.uuid, {
							payment,
							order: summary,
							meta: (meta) => withAwaitingCustomer(meta, awaiting),
							sentRevision: post.sentRevision(),
						});
						await post.settle();
					} catch (error) {
						// The store has already answered; only this till's copy is behind. Pull it.
						const id = order.getLatest().payload.id;
						if (id) await refreshOrderRecord(manager, id).catch(() => undefined);
						throw error;
					}
				},
			};
		},
		[http, manager, ctx, storeDB, wpCredentials.id]
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
			input: { attemptId: string; values: DeclaredValues; destination: string | null },
			options: { approval?: OrderApproval; sessionId?: string | null } = {}
		) =>
			submitGatewayPayment(
				gatewayOrder(order),
				methodId,
				input,
				deps(order, { ...options, destination: input.destination })
			),
		[deps]
	);
	const cancel = React.useCallback(
		(order: EngineRecord<'orders'>, stamp: AwaitingCustomerStamp) =>
			cancelGatewayInvoice(gatewayOrder(order), stamp, deps(order, {})),
		[deps]
	);
	return React.useMemo(() => ({ submit, cancel }), [submit, cancel]);
}
