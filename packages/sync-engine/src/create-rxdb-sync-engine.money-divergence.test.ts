/**
 * The order-money ROUND-TRIP contract (R1) — what a push ack is allowed to do
 * to a resident order's money, driven through the PUBLIC engine handle.
 *
 * Four properties, each of which was an open question before this suite:
 *  (a) precision preservation — a 2dp ack of the SAME number must not clobber
 *      the resident's six-decimal money (#946);
 *  (b) server-authoritative identity still grafts — ids / number / order_key
 *      remain the server's (no #1008 / #815 regression);
 *  (c) sparse-ack tolerance — an ack that OMITS an array must not destroy the
 *      resident's copy of it;
 *  (d) no re-push oscillation — adoption plus any divergence alert must enqueue
 *      exactly zero new mutations.
 *
 * Plus the divergence detector itself: silent on the oracle's 2dp ack, loud on
 * a real server-side recalculation, and scoped to the record that diverged.
 */

import { describe, expect, it } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import {
	createFakeWriteServer,
	ORDER_MONEY_ORACLE,
	ORDER_MONEY_ORACLE_LINE_UUID,
} from '@wcpos/sync-core/testing';
import type { StoreScopeIdentity, SyncEvent, SyncObserver } from '@wcpos/sync-core';

import {
	createRxdbSyncEngine,
	type EngineEvent,
	type RxdbSyncEngine,
} from './create-rxdb-sync-engine';
import { memoryEngineStorage } from './testing';

setPremiumFlag();

const SITE = 'https://money.example.test';
const ORDER_UUID = '9a9a9a9a-1111-4111-8111-aaaaaaaaaaaa';

let scopeSequence = 0;
function freshIdentity(): StoreScopeIdentity {
	scopeSequence += 1;
	return { site: SITE, storeId: 7, cashierId: `money-${scopeSequence}` };
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

/** The oracle order as the POS holds it: exact six-decimal money, uuid-stamped. */
function posPayload(): Record<string, unknown> {
	return {
		...clone(ORDER_MONEY_ORACLE.pos),
		meta_data: [{ key: '_woocommerce_pos_uuid', value: ORDER_UUID }],
	};
}

/** The same order as the server serializes it today: display decimals (#946). */
function serverPayload(): Record<string, unknown> {
	return clone(ORDER_MONEY_ORACLE.server2dp);
}

/**
 * The server's response projection. The real controller re-serializes the saved
 * order rather than echoing the push, so every test states explicitly what came
 * back — that is the whole subject of this suite.
 */
type Serialize = (payload: Record<string, unknown>) => Record<string, unknown>;

/** Render every monetary string of the stored payload at display decimals. */
const toDisplayDecimals: Serialize = () => serverPayload();

function engineWith(input: { serialize?: Serialize; diagnostics?: SyncObserver }): {
	engine: RxdbSyncEngine;
	server: ReturnType<typeof createFakeWriteServer>;
} {
	const server = createFakeWriteServer(
		input.serialize ? { serialize: (payload) => input.serialize!(payload) } : {}
	);
	const engine = createRxdbSyncEngine(
		{
			site: {
				syncBaseUrl: `${SITE}/wp-json/wcpos/v2`,
				wpJsonRoot: `${SITE}/wp-json`,
			},
			storage: memoryEngineStorage(),
			fetcher: async (url, init) =>
				url.endsWith('/changes/config-fingerprint')
					? Response.json({ fingerprints: {} })
					: server.fetch(url, init as never),
			mode: 'manual',
			...(input.diagnostics ? { diagnostics: input.diagnostics } : {}),
		},
		freshIdentity()
	);
	return { engine, server };
}

async function insertResident(
	engine: RxdbSyncEngine,
	payload: Record<string, unknown>,
	over: { wooOrderId?: number | null; revision?: string } = {}
): Promise<void> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	await (
		scope.database.collections.orders as {
			insert(doc: unknown): Promise<unknown>;
		}
	).insert({
		id: ORDER_UUID,
		wooOrderId: over.wooOrderId ?? null,
		number: '',
		dateCreatedGmt: '2026-08-06T00:00:00',
		status: String(payload.status ?? 'processing'),
		total: String(payload.total ?? '0.00'),
		customerId: 0,
		payload,
		sync: { revision: over.revision ?? '', partial: false, source: 'skeleton' },
		local: { dirty: false, pendingMutationIds: [] },
	});
}

async function residentJson(engine: RxdbSyncEngine): Promise<Record<string, unknown>> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	const doc = await (
		scope.database.collections.orders as {
			findOne(id: string): {
				exec(): Promise<{ toJSON(): Record<string, unknown> } | null>;
			};
		}
	)
		.findOne(ORDER_UUID)
		.exec();
	if (!doc) throw new Error('resident order vanished');
	return doc.toJSON();
}

function residentPayload(row: Record<string, unknown>): Record<string, unknown> {
	return row.payload as Record<string, unknown>;
}

function lineOf(payload: Record<string, unknown>): Record<string, unknown> {
	return (payload.line_items as Record<string, unknown>[])[0]!;
}

async function pendingMutationCount(engine: RxdbSyncEngine): Promise<number> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	const docs = await (
		scope.database.collections.recordMutations as {
			find(): { exec(): Promise<{ toJSON(): Record<string, unknown> }[]> };
		}
	)
		.find()
		.exec();
	return docs.filter((doc) => doc.toJSON().status === 'pending').length;
}

/** Create + drain the oracle order, capturing every engine event and diagnostic. */
async function saveOracleOrder(input: {
	serialize?: Serialize;
	payload?: Record<string, unknown>;
}): Promise<{
	engine: RxdbSyncEngine;
	server: ReturnType<typeof createFakeWriteServer>;
	events: EngineEvent[];
	diagnostics: SyncEvent[];
	dispose: () => Promise<void>;
}> {
	const diagnostics: SyncEvent[] = [];
	const { engine, server } = engineWith({
		...(input.serialize ? { serialize: input.serialize } : {}),
		diagnostics: (event) => diagnostics.push(event),
	});
	await engine.ready;
	const events: EngineEvent[] = [];
	engine.events((event) => events.push(event));
	const payload = input.payload ?? posPayload();
	await insertResident(engine, payload);
	await engine.write({
		collection: 'orders',
		operation: 'create',
		recordId: ORDER_UUID,
		payload,
		explicit: true,
	});
	await engine.sync('write-drain');
	return {
		engine,
		server,
		events,
		diagnostics,
		dispose: () => engine.dispose(),
	};
}

function divergenceEvents(events: EngineEvent[]) {
	return events.filter((event) => event.type === 'order-money-divergence');
}

describe('(a) precision preservation — a 2dp ack of the same number must not clobber 6dp money', () => {
	it('keeps the resident’s six-decimal money when the ack says the same number narrower', async () => {
		const run = await saveOracleOrder({ serialize: toDisplayDecimals });
		try {
			const payload = residentPayload(await residentJson(run.engine));
			expect(payload.total).toBe('36.683280');
			expect(payload.total_tax).toBe('6.713280');
			expect(payload.cart_tax).toBe('6.713280');
			expect(lineOf(payload).total_tax).toBe('6.713280');
			expect((lineOf(payload).taxes as Record<string, unknown>[])[0]!.total).toBe('5.994000');
			expect((payload.tax_lines as Record<string, unknown>[])[1]!.tax_total).toBe('0.719280');
		} finally {
			await run.dispose();
		}
	});

	it('adopts the server value outright when the number actually changed', async () => {
		const run = await saveOracleOrder({
			serialize: () => ({ ...serverPayload(), total: '50.07' }),
		});
		try {
			const payload = residentPayload(await residentJson(run.engine));
			// Server is the source of truth — the changed value is adopted verbatim…
			expect(payload.total).toBe('50.07');
			// …while everything it merely re-rendered keeps its precision.
			expect(payload.total_tax).toBe('6.713280');
		} finally {
			await run.dispose();
		}
	});

	it('promotes the adopted total onto the indexed column, precision and all', async () => {
		const run = await saveOracleOrder({ serialize: toDisplayDecimals });
		try {
			expect((await residentJson(run.engine)).total).toBe('36.683280');
		} finally {
			await run.dispose();
		}
	});
});

describe('(b) server-authoritative fields still graft (no #1008 / #815 regression)', () => {
	it('takes the server’s id, number and order_key while keeping local precision', async () => {
		const run = await saveOracleOrder({
			serialize: (stored) => ({
				...serverPayload(),
				id: 4242,
				number: '4242',
				order_key: 'wc_order_abc123',
				line_items: (serverPayload().line_items as Record<string, unknown>[]).map((line) => ({
					...line,
					id: 77,
				})),
				meta_data: (stored.meta_data ?? []) as unknown[],
			}),
		});
		try {
			const row = await residentJson(run.engine);
			const payload = residentPayload(row);
			// `wooOrderId` comes from the ack document's own `id` (reconcileCreateAck),
			// which the write contract stamps — not from anything the projection says.
			expect(row.wooOrderId).toBe(500);
			expect(payload.number).toBe('4242');
			expect(payload.order_key).toBe('wc_order_abc123');
			expect(lineOf(payload).id).toBe(77);
			// The uuid identity meta survives adoption (POS_ORDER_IDENTITY_META_KEYS).
			expect(payload.meta_data).toContainEqual({
				key: '_woocommerce_pos_uuid',
				value: ORDER_UUID,
			});
			// …and the money is still the POS's.
			expect(payload.total_tax).toBe('6.713280');
		} finally {
			await run.dispose();
		}
	});
});

describe('(c) sparse-ack tolerance — an omitted array must not destroy the resident’s copy', () => {
	it('keeps resident line_items when the ack omits them entirely', async () => {
		const run = await saveOracleOrder({
			serialize: () => {
				const trimmed = serverPayload();
				delete trimmed.line_items;
				delete trimmed.tax_lines;
				return trimmed;
			},
		});
		try {
			const payload = residentPayload(await residentJson(run.engine));
			expect(Array.isArray(payload.line_items)).toBe(true);
			expect((payload.line_items as unknown[]).length).toBe(1);
			expect(lineOf(payload).total).toBe('29.970000');
			expect((payload.tax_lines as unknown[]).length).toBe(2);
		} finally {
			await run.dispose();
		}
	});

	it('still adopts an array the ack DID send, even when it is shorter', async () => {
		// Omission means "no opinion"; a present-but-shorter array is the server
		// telling us a line is gone, and that must land.
		const run = await saveOracleOrder({
			serialize: () => ({ ...serverPayload(), line_items: [] }),
		});
		try {
			const payload = residentPayload(await residentJson(run.engine));
			expect(payload.line_items).toEqual([]);
		} finally {
			await run.dispose();
		}
	});

	it('survives the minimal `{ id }` ack the push contract permits', async () => {
		const run = await saveOracleOrder({
			serialize: (stored) => ({
				meta_data: (stored.meta_data ?? []) as unknown[],
			}),
		});
		try {
			const row = await residentJson(run.engine);
			const payload = residentPayload(row);
			expect(row.wooOrderId).toBe(500);
			expect(payload.total).toBe('36.683280');
			expect((payload.line_items as unknown[]).length).toBe(1);
		} finally {
			await run.dispose();
		}
	});
});

describe('(d) no re-push oscillation', () => {
	it('enqueues nothing new after adoption — with or without a divergence', async () => {
		for (const serialize of [
			toDisplayDecimals,
			() => ({ ...serverPayload(), total: '50.07' }),
		] as Serialize[]) {
			const run = await saveOracleOrder({ serialize });
			try {
				expect(await pendingMutationCount(run.engine)).toBe(0);
				// A second drain must find nothing to push — the ack did not create work.
				expect(await run.engine.sync('write-drain')).toMatchObject({
					pushed: 0,
				});
				expect(run.server.received).toHaveLength(1);
			} finally {
				await run.dispose();
			}
		}
	});

	it('leaves the record clean: no pending ids, not dirty', async () => {
		const run = await saveOracleOrder({ serialize: toDisplayDecimals });
		try {
			const row = await residentJson(run.engine);
			expect(row.local).toEqual({ dirty: false, pendingMutationIds: [] });
		} finally {
			await run.dispose();
		}
	});
});

describe('divergence detection at the ack boundary', () => {
	it('is SILENT for the oracle’s 2dp ack — an alert that fires on every sale is never read', async () => {
		const run = await saveOracleOrder({ serialize: toDisplayDecimals });
		try {
			expect(divergenceEvents(run.events)).toEqual([]);
			expect(run.diagnostics.filter((event) => event.type === 'push.money-divergence')).toEqual([]);
		} finally {
			await run.dispose();
		}
	});

	it('is silent when the server echoes the push verbatim', async () => {
		const run = await saveOracleOrder({});
		try {
			expect(divergenceEvents(run.events)).toEqual([]);
		} finally {
			await run.dispose();
		}
	});

	it('emits a typed event naming the fields, expected and got, for a real recalculation', async () => {
		const run = await saveOracleOrder({
			serialize: () => ({
				...serverPayload(),
				total: '50.07',
				total_tax: '11.10',
			}),
		});
		try {
			expect(divergenceEvents(run.events)).toEqual([
				{
					type: 'order-money-divergence',
					collection: 'orders',
					recordId: ORDER_UUID,
					mutationId: expect.any(String),
					mode: 'server-precision',
					fields: [
						{ field: 'total', expected: '36.68', got: '50.07', decimals: 2 },
						{ field: 'total_tax', expected: '6.71', got: '11.10', decimals: 2 },
					],
				},
			]);
		} finally {
			await run.dispose();
		}
	});

	it('logs it durably at ERROR — a broken mirror is a terminal anomaly (#899)', async () => {
		const run = await saveOracleOrder({
			serialize: () => ({ ...serverPayload(), total: '50.07' }),
		});
		try {
			const logged = run.diagnostics.filter((event) => event.type === 'push.money-divergence');
			expect(logged).toHaveLength(1);
			expect(logged[0]).toMatchObject({
				type: 'push.money-divergence',
				level: 'error',
				collection: 'orders',
				fields: expect.objectContaining({
					recordId: ORDER_UUID,
					outcome: 'failed',
					mode: 'server-precision',
					divergentFields: 'total',
				}),
			});
		} finally {
			await run.dispose();
		}
	});

	it('reports a line-level divergence by line uuid', async () => {
		const run = await saveOracleOrder({
			serialize: () => {
				const payload = serverPayload();
				(payload.line_items as Record<string, unknown>[])[0]!.total = '19.98';
				return payload;
			},
		});
		try {
			const [event] = divergenceEvents(run.events) as {
				fields: { field: string }[];
			}[];
			expect(event?.fields.map((f) => f.field)).toContain(
				`line_items[${ORDER_MONEY_ORACLE_LINE_UUID}].total`
			);
		} finally {
			await run.dispose();
		}
	});

	it('fires BEFORE the acknowledgement so a listener sees the anomaly with the outcome', async () => {
		const run = await saveOracleOrder({
			serialize: () => ({ ...serverPayload(), total: '50.07' }),
		});
		try {
			const types = run.events.map((event) => event.type);
			expect(types.indexOf('order-money-divergence')).toBeGreaterThanOrEqual(0);
			expect(types.indexOf('order-money-divergence')).toBeLessThan(
				types.indexOf('write-acknowledged')
			);
		} finally {
			await run.dispose();
		}
	});

	it('does NOT fire for a born-twice create, whose ack document is not an answer to this payload', async () => {
		// The server already knows this uuid, so it answers 200 with the EXISTING
		// record and discards the pushed payload. Comparing them would report a
		// divergence for a write that never happened.
		const diagnostics: SyncEvent[] = [];
		const { engine, server } = engineWith({
			serialize: () => ({ ...serverPayload(), total: '999.99' }),
			diagnostics: (event) => diagnostics.push(event),
		});
		try {
			await engine.ready;
			const events: EngineEvent[] = [];
			engine.events((event) => events.push(event));
			server.seed(ORDER_UUID, { id: 4242, revision: 'sha256:seeded-r1' });
			await insertResident(engine, posPayload());
			await engine.write({
				collection: 'orders',
				operation: 'create',
				recordId: ORDER_UUID,
				payload: posPayload(),
				explicit: true,
			});
			await engine.sync('write-drain');
			expect(divergenceEvents(events)).toEqual([]);
		} finally {
			await engine.dispose();
		}
	});

	it('does not fire for a non-order collection', async () => {
		const events: EngineEvent[] = [];
		const { engine } = engineWith({});
		try {
			await engine.ready;
			engine.events((event) => events.push(event));
			await (
				engine.active()!.database.collections.customers as {
					insert(doc: unknown): Promise<unknown>;
				}
			).insert({
				id: ORDER_UUID,
				wooCustomerId: null,
				payload: {
					first_name: 'Ada',
					meta_data: [{ key: '_woocommerce_pos_uuid', value: ORDER_UUID }],
				},
				sync: { revision: '', partial: false, source: 'skeleton' },
				local: { dirty: false, pendingMutationIds: [] },
			});
			await engine.write({
				collection: 'customers',
				operation: 'create',
				recordId: ORDER_UUID,
				payload: { first_name: 'Ada', total: '1.00' },
			});
			await engine.sync('write-drain');
			expect(divergenceEvents(events)).toEqual([]);
		} finally {
			await engine.dispose();
		}
	});
});
