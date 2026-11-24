/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createFakeWriteServer } from '@wcpos/sync-core/testing';
import { createEngineHarness } from '@wcpos/sync-engine/testing';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { pushRecord } from '../../src/mutations/push-record';
import { useEngineRecord } from '../../src/record-readers/use-engine-document';

import type { QueryManager } from '../../src/mutations/resident';

setPremiumFlag();

let mockEngine: RxdbSyncEngine;
jest.mock('../../src/provider', () => ({
	...jest.requireActual('../../src/provider'),
	useQueryRuntime: () => ({ engine: mockEngine }),
}));

const SITE = 'https://warm-pay.example.test';
const ORDER_UUID = '88888888-8888-4888-8888-888888888888';
const SERVER_ID = 900_000_201;

type OrderRecord = { remoteId: string | null; payload: { id?: number } };

async function insertBornLocalOrder(engine: RxdbSyncEngine): Promise<void> {
	const scope = engine.active();
	if (!scope) throw new Error('no active scope');
	await (scope.database.collections.orders as { insert(doc: unknown): Promise<unknown> }).insert({
		posUserId: '',
		posStoreId: '',
		uuid: ORDER_UUID,
		remoteId: null,
		remoteKey: '',
		number: '',
		dateCreatedGmt: '2026-11-24T00:00:00',
		status: 'pos-open',
		total: '0.00',
		customerId: 0,
		payload: {
			status: 'pos-open',
			line_items: [],
			meta_data: [{ key: '_woocommerce_pos_uuid', value: ORDER_UUID }],
		},
		sync: { revision: '', partial: false, source: 'skeleton' },
		local: { dirty: false, pendingMutationIds: [] },
	});
}

/** What `CheckoutScreen` hands `bouncesToCart`: the resource's current answer, read synchronously. */
function serverIdOf(resource: { valueRef$$: { value?: { current?: OrderRecord | null } } }) {
	return resource.valueRef$$.value?.current?.payload.id;
}

/**
 * The legacy Pay (no tender flow) on a till that already reads the order: `pushRecord` resolves,
 * Pay pushes the sheet and its `finally` clears the save state, so the sheet's `CheckoutScreen`
 * decides on the record's FIRST answer alone. That answer must already carry the server id, or
 * `bouncesToCart` sends a just-saved order back to its cart. Real engine, real write drain, real
 * RxDB: nothing about the record's answer is mocked.
 */
describe('a warm legacy Pay: the record carries the server id once pushRecord resolves', () => {
	let engine: RxdbSyncEngine;
	let server: ReturnType<typeof createFakeWriteServer>;
	/** Write envelopes only: auto-mode boot lanes GET this server too. */
	const writesReceived = () =>
		server.received.filter((envelope) => envelope.mutationId !== undefined);

	beforeEach(async () => {
		server = createFakeWriteServer({ firstId: SERVER_ID });
		engine = createEngineHarness({
			site: SITE,
			identity: { site: SITE, storeId: 7, cashierId: `warm-pay-${Date.now()}` },
			mode: 'auto',
			fetch: (url, init) => server.fetch(url, init as never),
			intervals: { writeDrainPollMs: 600_000 },
			awaitReady: false,
		}).engine;
		mockEngine = engine;
		await engine.ready;
		await insertBornLocalOrder(engine);
	});

	afterEach(async () => {
		await engine.dispose();
	});

	it('the retained till reader and a new sheet reader both answer with the server id', async () => {
		// The till: a reader of this order mounted and committed before Pay is pressed.
		const till = renderHook(() => useEngineRecord('orders', ORDER_UUID));
		await waitFor(() => expect(till.result.current.valueRef$$.value).toBeDefined());
		const warm = till.result.current;
		const pressed = warm.valueRef$$.value?.current as unknown as OrderRecord;
		expect(pressed.remoteId).toBeNull();
		expect(serverIdOf(warm)).toBeUndefined();

		// Pay's legacy lane: `await pushDocument(currentOrderRecord)`, then `router.push(sheetRoute)`.
		let saved: unknown;
		await act(async () => {
			saved = await pushRecord({ engine } as unknown as QueryManager, pressed as never);
		});

		// No tick between the resolve and the sheet's render: read the warm resource as it is now.
		expect(serverIdOf(warm)).toBe(SERVER_ID);
		expect(writesReceived()).toEqual([
			expect.objectContaining({ operation: 'create', recordId: ORDER_UUID }),
		]);
		expect((saved as OrderRecord).payload.id).toBe(SERVER_ID);
		const sheet = renderHook(() => useEngineRecord('orders', ORDER_UUID));
		expect(sheet.result.current).toBe(warm);
		expect(serverIdOf(sheet.result.current)).toBe(SERVER_ID);

		sheet.unmount();
		till.unmount();
	});

	it('with no reader before Pay, the sheet reader first answers with the server id', async () => {
		const scope = engine.active();
		const pressed = await (
			scope!.database.collections.orders as {
				findOne(id: string): { exec(): Promise<unknown> };
			}
		)
			.findOne(ORDER_UUID)
			.exec();

		await act(async () => {
			await pushRecord({ engine } as unknown as QueryManager, pressed as never);
		});

		const sheet = renderHook(() => useEngineRecord('orders', ORDER_UUID));
		const answers: (number | undefined)[] = [];
		const subscription = sheet.result.current.valueRef$$.subscribe((ref) => {
			if (ref !== undefined) answers.push((ref.current as unknown as OrderRecord)?.payload.id);
		});
		await waitFor(() => expect(answers.length).toBeGreaterThan(0));
		expect(answers[0]).toBe(SERVER_ID);
		expect(writesReceived()).toEqual([
			expect.objectContaining({ operation: 'create', recordId: ORDER_UUID }),
		]);

		subscription.unsubscribe();
		sheet.unmount();
	});
});
