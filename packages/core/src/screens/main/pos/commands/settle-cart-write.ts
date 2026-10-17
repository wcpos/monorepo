import cloneDeep from 'lodash/cloneDeep';

import { settleAggregate, settlementPatch, snapshotFromOrderJSON } from '@wcpos/order-math';
import type { CartConfig } from '@wcpos/order-math';

import type { PayloadChanges } from '../../hooks/mutations/use-local-mutation';
import type { CurrentOrderRecord } from '../contexts/current-order/context';
import type { OrderPayload } from './cart-config-for-order';

/** Called only inside the command's existing per-order mutation slot. */
export function settleCartWrite<T>(
	input: { document: CurrentOrderRecord; data: object },
	deps: {
		localPatch: (input: { document: CurrentOrderRecord; changes: PayloadChanges }) => T;
		configForOrder: (order: OrderPayload) => CartConfig;
		serverOwnsMoney: (uuid: string) => boolean;
	}
): T {
	const document = input.document.getLatest();
	return deps.localPatch({
		document,
		changes: (currentPayload) => {
			const payload = cloneDeep(currentPayload) as OrderPayload;
			// localPatch omits undefined fields; settle what it will actually persist.
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
			return { ...input.data, ...(result?.changed ? settlementPatch(result) : {}) };
		},
	});
}
