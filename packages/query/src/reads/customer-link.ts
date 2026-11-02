import { EMPTY } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

import { remoteIdOrNull } from '@wcpos/sync-core';
import { type EngineEvent, hasPendingLocalWork, type RxdbSyncEngine } from '@wcpos/sync-engine';

import { findEngineResident, type QueryManager } from '../mutations/resident';
import { engineCollection } from '../records/engine-collection';
import { observeResidentRead } from '../resident-read';
import { getTemporaryOrder } from '../temporary-order';

export function observeOrderLinkStates(engine: RxdbSyncEngine, uuids: string[]) {
	if (uuids.length === 0) return EMPTY;
	return observeResidentRead<string>(engine, {
		collections: ['orders'],
		absent: EMPTY,
		read: (database) =>
			engineCollection(database, 'orders')!
				.find({ selector: { uuid: { $in: uuids } } })
				.$.pipe(
					map((documents) =>
						documents
							.map((document) => {
								const { uuid, payload, local } = document.toJSON();
								return `${uuid}:${payload.status}:${payload.customer_id}:${hasPendingLocalWork({ local })}`;
							})
							.join('|')
					),
					distinctUntilChanged()
				),
	});
}

export async function readCustomerRemoteId(manager: QueryManager, uuid: string) {
	const resident = await findEngineResident(manager, 'customers', uuid);
	if (!resident) return null;
	const { remoteId, payload } = resident.toMutableJSON() as {
		remoteId?: unknown;
		payload?: Record<string, unknown>;
	};
	const id = remoteIdOrNull(remoteId) ?? remoteIdOrNull(payload?.id);
	return { remoteId: id === null ? null : Number(id) };
}

export async function readOrderLinkState(manager: QueryManager, uuid: string) {
	const document =
		(await getTemporaryOrder(uuid)) ?? (await findEngineResident(manager, 'orders', uuid));
	if (!document) return null;
	const { payload, local } = document.toMutableJSON() as {
		payload?: Record<string, unknown>;
		local?: { dirty?: boolean };
	};
	// The adapter only needs identity and template ownership; no mutable document leaves query.
	return {
		document: { uuid, isNew: Boolean((document as { isNew?: boolean }).isNew) },
		payload: payload ?? {},
		dirty: hasPendingLocalWork({ local }),
	};
}

export function isCollectionEvent(event: EngineEvent, name: string): boolean {
	return 'collection' in event && event.collection === name;
}
