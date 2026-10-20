import { describe, expect, it } from 'vitest';

import { writeFacetFor } from './collection-descriptors';
import { remoteId } from '../testing';

import type { RxDatabase } from 'rxdb';

// A create ack may be trimmed or withheld while a successor is pending. The mirror must
// follow the adopted identity, not the ack payload (which may never be adopted).
describe('remote key acknowledgements', () => {
	it.each(['orders', 'products', 'variations', 'customers'] as const)(
		'%s create ack',
		async (collection) => {
			const resident: Record<string, unknown> = {
				uuid: 'local',
				remoteId: null,
				remoteKey: '',
				payload: {},
				sync: {},
				local: { pendingMutationIds: ['create', 'successor'] },
			};
			const db = {
				collections: {
					[collection]: {
						findOne: () => ({
							exec: async () => ({
								incrementalModify: async (modify: (row: typeof resident) => typeof resident) =>
									Object.assign(resident, modify(resident)),
							}),
						}),
					},
				},
			} as unknown as RxDatabase;
			await writeFacetFor(collection)!.reconcile(db, {
				recordId: 'local',
				remoteId: remoteId(7),
				currentRevision: 'r1',
				document: { id: 7 },
				mutation: { mutationId: 'create', operation: 'create', recordId: 'local' },
			});
			expect(resident).toMatchObject({ remoteId: '7', remoteKey: '7' });
		}
	);
});

it.each(['products', 'variations', 'customers', 'coupons'] as const)(
	'%s repository upsert reprojects identity after reconciliation',
	async (collection) => {
		let written: Record<string, unknown>[] = [];
		const db = {
			collections: {
				[collection]: {
					bulkUpsert: async (docs: typeof written) => {
						written = docs;
						return { success: docs, error: [] };
					},
				},
			},
		} as unknown as RxDatabase;
		await writeFacetFor(collection)!.upsertServerDocument(db, {
			uuid: 'local',
			remoteId: '7',
			remoteKey: '',
			payload: {},
		});
		expect(written[0]).toMatchObject({ remoteId: '7', remoteKey: '7' });
	}
);

it('order acknowledgement clears an absent server stamp and retains the hint with its Woo id', async () => {
	const hint = { key: '_wcpos_money_owner_hint', value: 'server' };
	const uuid = { key: '_woocommerce_pos_uuid', value: '00000000-0000-4000-8000-000000000077' };
	const resident = {
		payload: { meta_data: [uuid, hint, { key: '_wcpos_money_owner', value: 'server' }] },
		local: { pendingMutationIds: ['hint'] },
	};
	const db = {
		collections: {
			orders: {
				findOne: () => ({
					exec: async () => ({
						incrementalModify: async (modify: (row: typeof resident) => typeof resident) =>
							Object.assign(resident, modify(resident)),
					}),
				}),
			},
		},
	} as unknown as RxDatabase;
	await writeFacetFor('orders')!.reconcile(db, {
		recordId: uuid.value,
		remoteId: remoteId(7),
		currentRevision: 'r1',
		document: { id: 7, meta_data: [uuid, { ...hint, id: 8 }] },
		mutation: { mutationId: 'hint', operation: 'update', recordId: uuid.value },
	});
	expect(resident.payload.meta_data).toEqual([uuid, { ...hint, id: 8 }]);
});

it('an order ack adopts every server-owned meta key while a successor is queued', async () => {
	const uuid = { key: '_woocommerce_pos_uuid', value: '00000000-0000-4000-8000-000000000078' };
	const custom = { key: 'custom', value: 'local edit' };
	const resident = {
		payload: {
			meta_data: [
				uuid,
				custom,
				{ key: '_wcpos_payments', value: 'stale' },
				{ key: '_wcpos_completions', value: 'stale' },
			],
		},
		local: { pendingMutationIds: ['previous', 'successor'] },
	};
	const db = {
		collections: {
			orders: {
				findOne: () => ({
					exec: async () => ({
						incrementalModify: async (modify: (row: typeof resident) => typeof resident) =>
							Object.assign(resident, modify(resident)),
					}),
				}),
			},
		},
	} as unknown as RxDatabase;
	const ledger = { id: 9, key: '_wcpos_payments', value: 'server' };
	const commands = { id: 10, key: '_wcpos_commands', value: 'server' };
	const server = {
		id: 7,
		meta_data: [uuid, { key: 'custom', value: 'server copy' }, ledger, commands],
	};
	await writeFacetFor('orders')!.reconcile(db, {
		recordId: uuid.value,
		remoteId: remoteId(7),
		currentRevision: 'r2',
		document: server,
		identityDocument: server,
		mutation: { mutationId: 'previous', operation: 'update', recordId: uuid.value },
	});
	expect(resident.payload.meta_data).toEqual([uuid, custom, ledger, commands]);
});

// ADR 0040 §1.3: only an ack that adopts the whole document certifies it; a naked revision
// write (a successor queued) leaves the previous adoption behind, which revokes its authority.
it.each([
	['adopts', [] as string[], { revision: 'r2', at: expect.any(Number) }],
	['writes a naked revision', ['successor'], { revision: 'r1', at: 1 }],
])('an order ack that %s stamps sync.adopted accordingly', async (_label, successors, adopted) => {
	const uuid = { key: '_woocommerce_pos_uuid', value: '00000000-0000-4000-8000-000000000079' };
	const resident: Record<string, unknown> = {
		payload: { meta_data: [uuid] },
		sync: { revision: 'r1', adopted: { revision: 'r1', at: 1 } },
		local: { pendingMutationIds: ['previous', ...successors] },
	};
	const db = {
		collections: {
			orders: {
				findOne: () => ({
					exec: async () => ({
						incrementalModify: async (modify: (row: typeof resident) => typeof resident) =>
							Object.assign(resident, modify(resident)),
					}),
				}),
			},
		},
	} as unknown as RxDatabase;
	const server = { id: 7, meta_data: [uuid] };
	await writeFacetFor('orders')!.reconcile(db, {
		recordId: uuid.value,
		remoteId: remoteId(7),
		currentRevision: 'r2',
		document: server,
		identityDocument: server,
		mutation: { mutationId: 'previous', operation: 'update', recordId: uuid.value },
	});
	expect(resident.sync).toMatchObject({ revision: 'r2', adopted });
});
