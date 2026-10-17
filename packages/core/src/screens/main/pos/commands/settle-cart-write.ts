import cloneDeep from 'lodash/cloneDeep';

import { settleAggregate, settlementPatch, snapshotFromOrderJSON } from '@wcpos/order-math';
import type { CartConfig } from '@wcpos/order-math';

import type { CurrentOrderRecord } from '../contexts/current-order/context';
import type { OrderPayload } from './cart-config-for-order';

/** Called only inside the command's existing per-order mutation slot. */
export function settleCartWrite<T>(
	input: { document: CurrentOrderRecord; data: object },
	deps: {
		localPatch: (input: { document: CurrentOrderRecord; data: object }) => T;
		configForOrder: (order: OrderPayload) => CartConfig;
		serverOwnsMoney: (uuid: string) => boolean;
	}
): T {
	const document = input.document.getLatest();
	const payload = cloneDeep(document.payload);
	// localPatch omits undefined fields; settle the payload it will actually persist.
	const intent = Object.fromEntries(
		Object.entries(input.data).filter(([, value]) => value !== undefined)
	);
	const after = { ...payload, ...intent };
	const owned =
		payload.meta_data?.some(
			(entry) => entry.key === '_wcpos_money_owner' && entry.value === 'server'
		) || deps.serverOwnsMoney(document.uuid);
	const result = owned
		? undefined
		: settleAggregate(snapshotFromOrderJSON(after), deps.configForOrder(after));
	return deps.localPatch({
		document,
		data: { ...input.data, ...(result?.changed ? settlementPatch(result) : {}) },
	});
}
