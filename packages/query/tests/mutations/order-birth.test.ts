import { serialize } from 'node:v8';

import { birthOrder, findBirthState, insertEngineResident } from '../../src/mutations';
import { createEngineDatabase, createFakeEngine } from '../../src/testing';
import { removeTemporaryOrder } from '../../src/temporary-order';

import type { QueryRuntime } from '../../src/provider';

jest.mock('../../src/temporary-order', () => ({ removeTemporaryOrder: jest.fn() }));

let database: Awaited<ReturnType<typeof createEngineDatabase>>;
let manager: QueryRuntime;
const write = jest.fn();
const recordId = 'order-uuid';
const payload = { line_items: [{ product_id: 1, quantity: 1 }] };

beforeEach(async () => {
	jest.clearAllMocks();
	database = await createEngineDatabase(['orders']);
	manager = { engine: Object.assign(createFakeEngine(database), { write }) } as QueryRuntime;
	write.mockResolvedValue({ mutationId: 'birth' });
});
afterEach(async () => database.close());

it.each([false, true])(
	'inserts or patches before enqueue, then removes the template (orphan: %s)',
	async (retry) => {
		const orphan = retry
			? await insertEngineResident({ manager, collection: 'orders', recordId, payload })
			: null;
		const next = {
			...payload,
			line_items: [...payload.line_items, { product_id: 2, quantity: 1 }],
		};
		write.mockImplementation(async (request) => {
			serialize(request.payload);
			const resident = await database.collections.orders.findOne(recordId).exec();
			expect(resident.payload.line_items).toEqual(next.line_items);
			expect(removeTemporaryOrder).not.toHaveBeenCalled();
			return { mutationId: 'birth' };
		});
		const saved = await birthOrder(manager, { recordId, payload: next, orphan });
		expect(saved.payload.line_items).toEqual(next.line_items);
		expect(write).toHaveBeenCalledTimes(1);
		expect(write).toHaveBeenCalledWith(
			expect.objectContaining({
				operation: 'create',
				recordId,
				payload: expect.objectContaining(next),
			})
		);
		expect(removeTemporaryOrder).toHaveBeenCalledWith(recordId);
	}
);

it.each([false, true])(
	'rolls back only the resident inserted by this attempt (orphan: %s)',
	async (retry) => {
		const orphan = retry
			? await insertEngineResident({ manager, collection: 'orders', recordId, payload })
			: null;
		write.mockRejectedValue(new Error('write: scope moved during enqueue'));
		await expect(birthOrder(manager, { recordId, payload, orphan })).rejects.toThrow(
			'scope moved during enqueue'
		);
		const resident = await database.collections.orders.findOne(recordId).exec();
		if (retry) expect(resident.payload.line_items).toEqual(payload.line_items);
		else expect(resident).toBeNull();
		expect(removeTemporaryOrder).not.toHaveBeenCalled();
	}
);

it('swallows failed rollback and surfaces the create failure', async () => {
	write.mockImplementation(async () => {
		database.collections.orders.preRemove(() => {
			throw new Error('rollback failed');
		}, false);
		throw new Error('enqueue failed');
	});
	await expect(birthOrder(manager, { recordId, payload })).rejects.toThrow('enqueue failed');
	expect(removeTemporaryOrder).not.toHaveBeenCalled();
});

it('strips blank billing email only from the enqueue copy', async () => {
	const input = { ...payload, billing: { email: '', first_name: 'Guest' } };
	const saved = await birthOrder(manager, { recordId, payload: input });
	expect(input.billing.email).toBe('');
	expect(saved.payload.billing?.email).toBe('');
	expect(write.mock.calls[0][0].payload.billing).toEqual({ first_name: 'Guest' });
});

it('finds no birth without a resident', async () => {
	await expect(findBirthState(manager, recordId)).resolves.toBe('none');
});

it.each([
	['orphan', false, [], null, ''],
	['born', true, [], null, ''],
	['born', false, ['mutation-1'], null, ''],
	['born', false, [], '4711', ''], // wc/v3 bare ack: revision stays empty for life.
	['born', false, [], null, 'revision-1'],
] as const)(
	'classifies %s (dirty %s, pending %s, remote %s, revision %s)',
	async (state, dirty, pendingMutationIds, remoteId, revision) => {
		const resident = await insertEngineResident({
			manager,
			collection: 'orders',
			recordId,
			payload,
		});
		await resident.incrementalPatch({
			local: { dirty, pendingMutationIds: [...pendingMutationIds] },
			remoteId,
			sync: { revision, source: 'skeleton', partial: false },
		});
		const result = await findBirthState(manager, recordId);
		expect(result).toHaveProperty(state, resident.getLatest());
		expect(write).not.toHaveBeenCalled();
	}
);
