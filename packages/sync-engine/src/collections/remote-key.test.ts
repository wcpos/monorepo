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
	// A whole document: its server-owned set replaces the resident's, deletions included.
	const server = {
		id: 7,
		total: '10.00',
		currency: 'USD',
		status: 'pos-open',
		date_paid: null,
		payment_method: '',
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

// The push contract allows a trimmed acknowledgement. It replaces only the server-owned keys it
// carries; every other server-owned key stays as the resident holds it until a whole document
// adopts. A bare `{ id }` changes no money: a paid resident still reads paid.
it.each([
	['a bare { id }', { id: 7 }, ['ledger', 'completions', 'method']],
	[
		'a trimmed document carrying only the ledger',
		{ id: 7, meta_data: [{ id: 9, key: '_wcpos_payments', value: 'server' }] },
		['completions', 'method', 'server ledger'],
	],
])('an order acked with %s keeps the server-owned keys it does not carry', async (_, ack, kept) => {
	const uuid = { key: '_woocommerce_pos_uuid', value: '00000000-0000-4000-8000-000000000081' };
	const local = {
		ledger: { key: '_wcpos_payments', value: 'paid' },
		completions: { key: '_wcpos_completions', value: [{ n: 1 }] },
		method: { key: '_wcpos_payment_method', value: 'cash' },
		'server ledger': { id: 9, key: '_wcpos_payments', value: 'server' },
	};
	const resident = {
		payload: {
			status: 'completed',
			meta_data: [uuid, local.ledger, local.completions, local.method],
		},
		local: { pendingMutationIds: ['previous'] },
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
		currentRevision: 'r2',
		document: ack,
		identityDocument: ack,
		mutation: { mutationId: 'previous', operation: 'update', recordId: uuid.value },
	});
	expect(resident.payload.status).toBe('completed');
	expect(resident.payload.meta_data).toEqual(
		expect.arrayContaining(kept.map((name) => local[name as keyof typeof local]))
	);
	expect(resident.payload.meta_data).toHaveLength(1 + kept.length);
});

// `serverOwnsMoney` still reads the ADR 0032 stamp, so an ack grafts it even while a successor
// is queued (no adoption): a stale resident stamp would let a cart write re-settle server money.
it('an order ack with a successor queued grafts the money-owner stamp it carries', async () => {
	const uuid = { key: '_woocommerce_pos_uuid', value: '00000000-0000-4000-8000-000000000082' };
	const resident = {
		payload: { meta_data: [uuid, { key: '_wcpos_money_owner', value: 'till' }] },
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
	const stamp = { id: 11, key: '_wcpos_money_owner', value: 'server' };
	const ack = { id: 7, meta_data: [uuid, stamp] };
	await writeFacetFor('orders')!.reconcile(db, {
		recordId: uuid.value,
		remoteId: remoteId(7),
		currentRevision: 'r2',
		document: ack,
		identityDocument: ack,
		mutation: { mutationId: 'previous', operation: 'update', recordId: uuid.value },
	});
	expect(resident.payload.meta_data).toEqual([uuid, stamp]);
});
