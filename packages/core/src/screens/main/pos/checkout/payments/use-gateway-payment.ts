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

import { useStoreSession } from '../../../../../contexts/app-state';
import { useRestHttpClient } from '../../../hooks/use-rest-http-client';
import { mirrorAnswer } from '../../commands/land-answer';
import { useOrderLedgerWrite } from '../../commands/use-order-ledger-write';
import { commandProvenance } from '../provenance/command-provenance';
import {
	cancelGatewayInvoice,
	submitGatewayPayment,
	type SubmitGatewayPaymentDeps,
} from './submit-gateway-payment';

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
	const { stampCompletion } = useOrderLedgerWrite();
	const ctx = React.useMemo(
		() => ({ userDB, siteUuid: site.uuid!, storeId: store.id, runtime: manager, stampCompletion }),
		[userDB, site.uuid, store.id, manager, stampCompletion]
	);

	const deps = React.useCallback(
		(
			order: EngineRecord<'orders'>,
			options: {
				destination?: string | null;
				approval?: OrderApproval;
				sessionId?: string | null;
			} = {}
		) => {
			const post = moneyCommandPoster({
				runtime: manager,
				storeDB,
				orderUuid: order.uuid,
				post: (url, body) => http.post(url, body),
				// A cancel is never approval-checked; a submit carries the cashier's press.
				approval: options.approval,
				provenance: (command) => commandProvenance(ctx, order, options.sessionId ?? null, command),
			});
			const facts = { sessionId: options.sessionId };
			const mirror = mirrorAnswer({ ctx, order, poster: post, facts });
			return {
				post,
				cashierId: wpCredentials.id ?? 0,
				destination: options.destination ?? null,
				mirror: ({ awaiting, accepted, ...answer }) =>
					mirror({ ...answer, meta: (meta) => withAwaitingCustomer(meta, awaiting) }, { accepted }),
			} satisfies SubmitGatewayPaymentDeps;
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
			cancelGatewayInvoice(gatewayOrder(order), stamp, deps(order)),
		[deps]
	);
	return React.useMemo(() => ({ submit, cancel }), [submit, cancel]);
}
