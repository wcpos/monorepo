import * as React from 'react';

import { settleCartWrite } from './settle-cart-write';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useCartConfigReader } from '../hooks/use-cart-config';
import {
	useServerOwnsMoneyReader,
	useStoreContractReader,
} from '../contexts/order-money-divergence';

import type { CurrentOrderRecord } from '../contexts/current-order/context';

/** Same-slot write: callers already hold the per-order queue, including coupon writers. */
export function useCartWrite() {
	const storeContract = useStoreContractReader();
	const { localPatch } = useLocalMutation();
	const configForOrder = useCartConfigReader();
	const serverOwnsMoney = useServerOwnsMoneyReader();
	const write = React.useCallback(
		(input: { document: CurrentOrderRecord; data: object }) =>
			settleCartWrite(input, {
				localPatch,
				configForOrder,
				serverOwnsMoney,
				storeContract,
			}),
		[localPatch, configForOrder, serverOwnsMoney, storeContract]
	);
	// Birth writes use the same settlement/ownership guard before inserting their resident.
	const settleIntent = React.useCallback(
		(document: CurrentOrderRecord, data: object) =>
			settleCartWrite(
				{ document, data },
				{
					localPatch: ({ changes }) => changes(document.getLatest().payload),
					// The birth runs after its dispatch hooks settle: read the config current then.
					configForOrder,
					serverOwnsMoney,
					storeContract,
				}
			),
		[configForOrder, serverOwnsMoney, storeContract]
	);
	return { localPatch: write, settleIntent };
}
