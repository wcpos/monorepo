import { describe, expect, it, vi } from 'vitest';

import { createRxKeyedRepository } from './rx-keyed-repository';

type State = { id: string; value: number };
type StoredState = State & { schemaVersion: 1; _deleted?: boolean };

function repository(collection: Record<string, unknown>) {
	return createRxKeyedRepository<State, StoredState>({
		collection: collection as never,
		keyOf: (state) => state.id,
		toDocument: (state) => ({ ...state, schemaVersion: 1 }),
		fromDocument: ({ schemaVersion: _schemaVersion, _deleted: _deleted, ...state }) => state,
	});
}

describe('createRxKeyedRepository', () => {
	it.each([
		{ error: { code: 'CONFLICT' }, label: 'RxDB conflict code' },
		{ error: { status: 409 }, label: 'HTTP conflict status' },
	])('reports an insert conflict for $label', async ({ error }) => {
		const insert = vi.fn().mockRejectedValue(error);
		const keyed = repository({ insert });

		await expect(keyed.insertIfAbsent({ id: 'one', value: 1 })).resolves.toBe(false);
		expect(insert).toHaveBeenCalledOnce();
	});

	it('rethrows a non-conflict insert failure', async () => {
		const failure = new Error('storage failed');
		const keyed = repository({ insert: vi.fn().mockRejectedValue(failure) });

		await expect(keyed.insertIfAbsent({ id: 'one', value: 1 })).rejects.toBe(failure);
	});

	it('returns the verdict from the final incremental-modify retry', async () => {
		const incrementalModify = vi.fn(async (modify: (document: StoredState) => StoredState) => {
			modify({ id: 'one', value: 1, schemaVersion: 1 });
			modify({ id: 'one', value: 2, schemaVersion: 1 });
		});
		const keyed = repository({
			findOne: () => ({
				exec: async () => ({
					toJSON: () => ({ id: 'one', value: 1, schemaVersion: 1 }),
					incrementalModify,
				}),
			}),
		});

		await expect(
			keyed.replaceIfCurrent(
				{ id: 'one', value: 1 },
				{ id: 'one', value: 3 },
				(left, right) => left.id === right.id && left.value === right.value
			)
		).resolves.toBe(false);
	});

	it('deletes only while the current value still matches', async () => {
		let stored: StoredState = { id: 'one', value: 1, schemaVersion: 1 };
		const keyed = repository({
			findOne: () => ({
				exec: async () => ({
					toJSON: () => stored,
					incrementalModify: async (modify: (document: StoredState) => StoredState) => {
						stored = modify(stored);
					},
				}),
			}),
		});

		await expect(
			keyed.removeIfCurrent(
				{ id: 'one', value: 1 },
				(left, right) => left.id === right.id && left.value === right.value
			)
		).resolves.toBe(true);
		expect(stored._deleted).toBe(true);
	});
});
