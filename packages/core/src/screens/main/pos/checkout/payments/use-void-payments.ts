import * as React from 'react';

import cloneDeep from 'lodash/cloneDeep';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { useQueryRuntime } from '@wcpos/query';
import type { EngineRecord } from '@wcpos/query';

import { patchEngineResident, useLocalMutation } from '../../../hooks/mutations/use-local-mutation';
import { useRestHttpClient } from '../../../hooks/use-rest-http-client';
import { voidPayments } from './void-payments';

import type { VoidPaymentsOutcome } from './void-payments';

/** Wire payment voiding to REST and the engine's offline/resident write seams. */
export function useVoidPayments(): (order: EngineRecord<'orders'>) => Promise<VoidPaymentsOutcome> {
	const http = useRestHttpClient();
	const onlineStatus = useOnlineStatus();
	const { localPatch } = useLocalMutation();
	const manager = useQueryRuntime();

	return React.useCallback(
		async (order) => {
			const payload = order.getLatest?.().payload ?? order.payload;
			return voidPayments(
				{
					uuid: order.uuid,
					id: payload.id ?? null,
					// RxDB serves object fields as Proxies; the ledger helpers need plain data.
					meta_data: cloneDeep(payload.meta_data ?? []),
				},
				{
					post: (url, body) => http.post(url, body),
					isOnline: () => onlineStatus.status === 'online-website-available',
					patchAndEnqueue: async (changes) => {
						await localPatch({ document: order, data: changes });
					},
					mirror: async (changes) => {
						await patchEngineResident({
							manager,
							collection: 'orders',
							recordId: order.uuid,
							changes,
						});
					},
				}
			);
		},
		[http, onlineStatus.status, localPatch, manager]
	);
}
