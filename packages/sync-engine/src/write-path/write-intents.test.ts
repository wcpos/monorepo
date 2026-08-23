import { serialize as structuredSerialize } from 'node:v8';

import { describe, expect, it } from 'vitest';

import { createFakeMutationCollection } from '@wcpos/sync-core/testing';
import type { QueuedMutation, RxRecordMutationCollection } from '@wcpos/sync-core';

import { enqueueWriteIntent, requeueBornTwiceSnapshot } from './write-intents';

import type { RxDatabase } from 'rxdb';

/**
 * Wrap a pre-seeded `queued` Map in the revision-checked RxDB-like contract, so a
 * test that builds its starting rows as a plain Map still exercises the
 * conditional writes the coalesce path now uses. The Map stays the assertion
 * view; a side revision counter provides the optimistic-concurrency token.
 */
function revCollectionOverMap(queued: Map<string, QueuedMutation>): RxRecordMutationCollection {
	const revs = new Map<string, string>();
	let counter = 0;
	const bump = (id: string) => {
		counter += 1;
		revs.set(id, `1-seed-${counter}`);
	};
	for (const id of queued.keys()) bump(id);
	const conflict = () => Object.assign(new Error('CONFLICT'), { status: 409, code: 'CONFLICT' });
	const docFor = (id: string) => {
		if (!queued.has(id)) return undefined;
		const captured = revs.get(id);
		return {
			toJSON: () => queued.get(id)!,
			get revision() {
				return revs.get(id) ?? '';
			},
			patch: async (changes: Partial<QueuedMutation>) => {
				if (!queued.has(id) || revs.get(id) !== captured) throw conflict();
				queued.set(id, { ...queued.get(id)!, ...changes });
				bump(id);
			},
			remove: async () => {
				if (!queued.has(id) || revs.get(id) !== captured) throw conflict();
				queued.delete(id);
				revs.delete(id);
			},
		};
	};
	return {
		bulkUpsert: async (items: QueuedMutation[]) => {
			for (const item of items) {
				queued.set(item.mutationId, item);
				bump(item.mutationId);
			}
			return { error: [] };
		},
		bulkInsert: async (items: QueuedMutation[]) => {
			const error: { documentId: string; status: number }[] = [];
			for (const item of items) {
				if (queued.has(item.mutationId)) error.push({ documentId: item.mutationId, status: 409 });
				else {
					queued.set(item.mutationId, item);
					bump(item.mutationId);
				}
			}
			return { success: [], error };
		},
		find: () => ({ exec: async () => [...queued.keys()].map((id) => docFor(id)!) }),
		bulkRemove: async (ids: string[]) => {
			for (const id of ids) {
				queued.delete(id);
				revs.delete(id);
			}
			return { error: [] };
		},
	};
}

async function enqueueCatalogPayload(
	collectionName: 'products' | 'variations' | 'customers',
	payload: Record<string, unknown>
) {
	const mutationCollection = createFakeMutationCollection();
	let residentData: Record<string, unknown> = {
		payload: { name: 'Probe' },
		sync: { revision: 'sha256:server-r1' },
		local: { dirty: false, pendingMutationIds: [] },
	};
	const resident = {
		incrementalModify: async (
			modify: (data: Record<string, unknown>) => Record<string, unknown>
		) => {
			residentData = modify(residentData);
		},
		remove: async () => undefined,
		toJSON: () => residentData,
	};
	const db = {
		collections: {
			[collectionName]: { findOne: () => ({ exec: async () => resident }) },
			recordMutations: mutationCollection,
		},
	} as unknown as RxDatabase;

	await enqueueWriteIntent({
		db,
		intent: {
			collection: collectionName,
			operation: 'update',
			recordId: 'product-1',
			payload,
		},
		mintUuid: () => 'mutation-1',
		now: () => '2026-08-14T00:00:00.000Z',
	});

	return [...mutationCollection.store.values()][0]?.mutation.payload;
}

describe('enqueueWriteIntent', () => {
	it('stores a plain payload even when the caller hands over an RxDB proxy', async () => {
		// Every queue row crosses a structured-clone boundary — a Worker on web, IPC
		// on Electron. `RxDocument.get()` returns a *Proxy* for object-valued paths,
		// and a Proxy is not cloneable: the write dies with "#<Object> could not be
		// cloned". Orders and products are laundered incidentally by their outbound
		// sanitizers rewriting the object; customers had nothing in the way, so the
		// seam normalizes every payload itself.
		const proxied = new Proxy(
			{ first_name: 'Ada', billing: { email: 'ada@example.com' } },
			{}
		) as Record<string, unknown>;

		const payload = await enqueueCatalogPayload('customers', proxied);

		expect(() => structuredSerialize(payload)).not.toThrow();
		// The nested object matters: the proxy's traps are what break the clone, and
		// a shallow copy at the seam would leave a nested one intact.
		expect(payload).toMatchObject({
			first_name: 'Ada',
			billing: { email: 'ada@example.com' },
		});
	});

	it.each(['products', 'variations'] as const)(
		'strips null cost_of_goods_sold values from %s payloads',
		async (collectionName) => {
			const payload = await enqueueCatalogPayload(collectionName, {
				name: 'Renamed probe',
				cost_of_goods_sold: {
					values: [{ defined_value: null, effective_value: 0 }],
					total_value: 0,
				},
			});

			expect(payload).not.toHaveProperty('cost_of_goods_sold');
			expect(payload).toMatchObject({ name: 'Renamed probe' });
		}
	);

	it('keeps finite product cost_of_goods_sold values in their writable shape', async () => {
		const payload = await enqueueCatalogPayload('products', {
			cost_of_goods_sold: {
				values: [{ defined_value: 8.5, effective_value: 8.5 }],
				total_value: 8.5,
			},
		});

		expect(payload?.cost_of_goods_sold).toEqual({ values: [{ defined_value: 8.5 }] });
	});

	it.each([
		['explicit create then plain update', true, false],
		['plain create then explicit update', false, true],
		['plain create then plain update', false, false],
	])('propagates explicit while coalescing %s', async (_label, priorExplicit, incomingExplicit) => {
		const mutationCollection = createFakeMutationCollection();
		const queued = {
			values: () => [...mutationCollection.store.values()].map((entry) => entry.mutation),
			get: (id: string) => mutationCollection.store.get(id)?.mutation,
		};
		let residentData: Record<string, unknown> = {
			payload: { status: 'pos-open' },
			sync: { revision: '' },
			local: { dirty: false, pendingMutationIds: [] },
		};
		const resident = {
			incrementalModify: async (
				modify: (data: Record<string, unknown>) => Record<string, unknown>
			) => {
				residentData = modify(residentData);
			},
			remove: async () => undefined,
			toJSON: () => residentData,
		};
		const db = {
			collections: {
				orders: { findOne: () => ({ exec: async () => resident }) },
				recordMutations: mutationCollection,
			},
		} as unknown as RxDatabase;
		let nextMutationId = 0;
		const deps = {
			db,
			mintUuid: () => `mutation-${++nextMutationId}`,
			now: () => '2026-08-04T00:00:00.000Z',
		};

		await enqueueWriteIntent({
			...deps,
			intent: {
				collection: 'orders',
				operation: 'create',
				recordId: 'order-1',
				payload: { status: 'pos-open' },
				...(priorExplicit ? { explicit: true } : {}),
			} as never,
		});
		await enqueueWriteIntent({
			...deps,
			intent: {
				collection: 'orders',
				operation: 'update',
				recordId: 'order-1',
				payload: { total: '10.00' },
				...(incomingExplicit ? { explicit: true } : {}),
			} as never,
		});

		expect([...queued.values()]).toHaveLength(1);
		expect([...queued.values()][0]?.explicit).toBe(priorExplicit || incomingExplicit || undefined);
	});

	it('strips non-string order meta display fields after coalescing over resident payload', async () => {
		const mutationCollection = createFakeMutationCollection();
		const queued = {
			values: () => [...mutationCollection.store.values()].map((entry) => entry.mutation),
			get: (id: string) => mutationCollection.store.get(id)?.mutation,
		};
		let residentData: Record<string, unknown> = {
			payload: {
				line_items: [
					{
						meta_data: [
							{
								key: '_woocommerce_pos_data',
								value: { price: '45' },
								display_value: { price: '45' },
							},
						],
					},
				],
			},
			sync: { revision: 'sha256:base-r1' },
			local: { dirty: false, pendingMutationIds: [] },
		};
		const resident = {
			incrementalModify: async (
				modify: (data: Record<string, unknown>) => Record<string, unknown>
			) => {
				residentData = modify(residentData);
			},
			remove: async () => undefined,
			toJSON: () => residentData,
		};
		const db = {
			collections: {
				orders: { findOne: () => ({ exec: async () => resident }) },
				recordMutations: mutationCollection,
			},
		} as unknown as RxDatabase;
		let nextMutationId = 0;
		const mintUuid = () => `mutation-${++nextMutationId}`;
		const now = () => '2026-07-27T00:00:00.000Z';

		await enqueueWriteIntent({
			db,
			intent: {
				collection: 'orders',
				operation: 'update',
				recordId: 'order-1',
				payload: { status: 'completed' },
			},
			mintUuid,
			now,
		});
		await enqueueWriteIntent({
			db,
			intent: {
				collection: 'orders',
				operation: 'update',
				recordId: 'order-1',
				payload: { customer_note: 'ring twice' },
			},
			mintUuid,
			now,
		});

		expect([...queued.values()]).toHaveLength(1);
		expect([...queued.values()][0]?.payload).toMatchObject({
			line_items: [
				{
					meta_data: [{ key: '_woocommerce_pos_data', value: { price: '45' } }],
				},
			],
		});
		expect(
			(
				(
					[...queued.values()][0]?.payload.line_items as {
						meta_data: Record<string, unknown>[];
					}[]
				)[0]?.meta_data[0] ?? {}
			).display_value
		).toBeUndefined();
	});

	/**
	 * #1507. The settlement's aggregate never enters the queue on its own, but it
	 * IS on the resident record — and a coalesced snapshot re-layers that record.
	 * Without the strip on this seam, every second cart edit would put the
	 * aggregate back on the wire behind a caller that only asked to send a line.
	 */
	it('keeps the server-authored money off a coalesced payload it inherited from the resident', async () => {
		const mutationCollection = createFakeMutationCollection();
		const queued = {
			values: () => [...mutationCollection.store.values()].map((entry) => entry.mutation),
		};
		let residentData: Record<string, unknown> = {
			payload: {
				status: 'pos-open',
				total: '36.68',
				total_tax: '6.71',
				cart_tax: '6.71328',
				discount_total: '0.00',
				discount_tax: '0.00',
				shipping_total: '0.00',
				shipping_tax: '0.00',
				tax_lines: [{ rate_id: 1, tax_total: '6.71328' }],
				line_items: [{ id: 3, subtotal: '30.00', total: '30.00' }],
			},
			sync: { revision: 'sha256:base-r1' },
			local: { dirty: false, pendingMutationIds: [] },
		};
		const resident = {
			incrementalModify: async (
				modify: (data: Record<string, unknown>) => Record<string, unknown>
			) => {
				residentData = modify(residentData);
			},
			remove: async () => undefined,
			toJSON: () => residentData,
		};
		const db = {
			collections: {
				orders: { findOne: () => ({ exec: async () => resident }) },
				recordMutations: mutationCollection,
			},
		} as unknown as RxDatabase;
		let nextMutationId = 0;
		const mintUuid = () => `mutation-${++nextMutationId}`;
		const now = () => '2026-08-23T00:00:00.000Z';

		for (const payload of [
			{ line_items: [{ id: 3, quantity: 2 }] },
			{ customer_note: 'ring twice' },
		]) {
			await enqueueWriteIntent({
				db,
				intent: { collection: 'orders', operation: 'update', recordId: 'order-1', payload },
				mintUuid,
				now,
			});
		}

		expect([...queued.values()]).toHaveLength(1);
		const payload = [...queued.values()][0]!.payload;
		expect(payload).toMatchObject({
			status: 'pos-open',
			customer_note: 'ring twice',
			line_items: [{ id: 3, quantity: 2 }],
		});
		for (const field of [
			'total',
			'total_tax',
			'cart_tax',
			'discount_total',
			'discount_tax',
			'shipping_total',
			'shipping_tax',
			'tax_lines',
		]) {
			expect(payload).not.toHaveProperty(field);
		}
	});

	it('strips non-string order meta display fields from a born-twice follow-up', async () => {
		const mutationCollection = createFakeMutationCollection();
		const queued = {
			values: () => [...mutationCollection.store.values()].map((entry) => entry.mutation),
			get: (id: string) => mutationCollection.store.get(id)?.mutation,
		};
		const db = {
			collections: {
				orders: { findOne: () => ({ exec: async () => null }) },
				recordMutations: mutationCollection,
			},
		} as unknown as RxDatabase;

		await requeueBornTwiceSnapshot({
			db,
			mutation: {
				mutationId: 'create-1',
				collectionName: 'orders',
				operation: 'create',
				recordId: 'order-1',
				origin: 'minted',
				payload: {
					meta_data: [
						{
							key: '_woocommerce_pos_data',
							value: { price: '45' },
							display_value: { price: '45' },
						},
					],
				},
				baseRevision: null,
				queuedAt: '2026-07-27T00:00:00.000Z',
				explicit: true,
			} as never,
			ackRevision: 'sha256:server-r1',
			mintUuid: () => 'follow-up-1',
			now: () => '2026-07-27T00:00:01.000Z',
		});

		expect([...queued.values()]).toHaveLength(1);
		expect([...queued.values()][0]?.explicit).toBe(true);
		expect([...queued.values()][0]?.payload.meta_data).toEqual([
			{ key: '_woocommerce_pos_data', value: { price: '45' } },
		]);
	});

	it('preserves explicit when a born-twice snapshot coalesces into a plain successor', async () => {
		const queued = new Map<string, QueuedMutation>([
			[
				'successor-1',
				{
					mutationId: 'successor-1',
					collectionName: 'orders',
					operation: 'update',
					recordId: 'order-1',
					origin: 'existing',
					payload: { customer_note: 'ring twice' },
					baseRevision: 'sha256:server-r1',
					queuedAt: '2026-08-04T00:00:01.000Z',
					seq: 2,
					status: 'pending',
				},
			],
		]);
		const mutationCollection = revCollectionOverMap(queued);
		const db = {
			collections: {
				orders: { findOne: () => ({ exec: async () => null }) },
				recordMutations: mutationCollection,
			},
		} as unknown as RxDatabase;

		await requeueBornTwiceSnapshot({
			db,
			mutation: {
				mutationId: 'create-1',
				collectionName: 'orders',
				operation: 'create',
				recordId: 'order-1',
				origin: 'minted',
				payload: { status: 'pos-open', total: '25.00' },
				baseRevision: null,
				queuedAt: '2026-08-04T00:00:00.000Z',
				explicit: true,
			} as never,
			ackRevision: 'sha256:server-r1',
			mintUuid: () => 'follow-up-1',
			now: () => '2026-08-04T00:00:02.000Z',
		});

		// The aggregate the original create carried is gone: the requeue passes
		// through the same outbound sanitizer (#1507), so a rebuilt payload cannot
		// smuggle back money the server discards unread.
		expect([...queued.values()]).toEqual([
			expect.objectContaining({
				mutationId: 'follow-up-1',
				explicit: true,
				payload: {
					status: 'pos-open',
					customer_note: 'ring twice',
				},
			}),
		]);
	});

	it('marks a tail-appended born-twice follow-up explicit when a contributing successor is explicit', async () => {
		const queued = new Map<string, QueuedMutation>([
			[
				'successor-1',
				{
					mutationId: 'successor-1',
					collectionName: 'orders',
					operation: 'update',
					recordId: 'order-1',
					origin: 'existing',
					payload: { customer_note: 'ring twice' },
					baseRevision: 'sha256:server-r1',
					queuedAt: '2026-08-04T00:00:01.000Z',
					seq: 2,
					status: 'claimed',
					explicit: true,
				},
			],
		]);
		const mutationCollection = revCollectionOverMap(queued);
		const db = {
			collections: {
				orders: { findOne: () => ({ exec: async () => null }) },
				recordMutations: mutationCollection,
			},
		} as unknown as RxDatabase;

		await requeueBornTwiceSnapshot({
			db,
			mutation: {
				mutationId: 'create-1',
				collectionName: 'orders',
				operation: 'create',
				recordId: 'order-1',
				origin: 'minted',
				payload: { status: 'pos-open', total: '25.00' },
				baseRevision: null,
				queuedAt: '2026-08-04T00:00:00.000Z',
			} as never,
			ackRevision: 'sha256:server-r1',
			mintUuid: () => 'follow-up-1',
			now: () => '2026-08-04T00:00:02.000Z',
		});

		// The claimed successor cannot coalesce, so the snapshot tail-appends —
		// and inherits the successor's release: its payload rides the follow-up.
		expect(queued.get('follow-up-1')).toEqual(
			expect.objectContaining({ mutationId: 'follow-up-1', explicit: true })
		);
	});
});
