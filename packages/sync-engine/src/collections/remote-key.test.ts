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
