import type { QueuedMutation, RxRecordMutationCollection } from './recordMutationQueue';

/**
 * A faithful RxDB-like fake for the durable mutation queue collection — for tests
 * that drive `RxRecordMutationStorage` (and the write-intent layer above it)
 * without a real RxDatabase.
 *
 * It models the ONE property the revision-checked writes depend on (task 43): a
 * monotonic `_rev` per row, and NON-incremental `patch`/`remove` that fail closed
 * with a native 409 CONFLICT when the stored `_rev` has moved since the document
 * was fetched. That is exactly RxDB's optimistic-concurrency contract, so a test
 * built on this fake exercises the same cross-process guard the real storage does.
 */
export function createFakeMutationCollection(): RxRecordMutationCollection & {
	store: Map<string, { mutation: QueuedMutation; rev: string }>;
} {
	const store = new Map<string, { mutation: QueuedMutation; rev: string }>();
	let revCounter = 0;
	const nextRev = () => `1-fake-${(revCounter += 1)}`;
	const conflict = () => Object.assign(new Error('CONFLICT'), { status: 409, code: 'CONFLICT' });

	const docFor = (mutationId: string) => {
		const captured = store.get(mutationId);
		if (!captured) return undefined;
		return {
			toJSON: () => store.get(mutationId)!.mutation,
			get revision() {
				return store.get(mutationId)?.rev ?? '';
			},
			patch: async (changes: Partial<QueuedMutation>) => {
				const current = store.get(mutationId);
				if (!current || current.rev !== captured.rev) throw conflict();
				store.set(mutationId, { mutation: { ...current.mutation, ...changes }, rev: nextRev() });
			},
			remove: async () => {
				const current = store.get(mutationId);
				if (!current || current.rev !== captured.rev) throw conflict();
				store.delete(mutationId);
			},
		};
	};

	return {
		store,
		bulkUpsert: async (items: QueuedMutation[]) => {
			for (const m of items) store.set(m.mutationId, { mutation: m, rev: nextRev() });
			return { error: [] };
		},
		bulkInsert: async (items: QueuedMutation[]) => {
			const error: { documentId: string; status: number }[] = [];
			for (const m of items) {
				if (store.has(m.mutationId)) error.push({ documentId: m.mutationId, status: 409 });
				else store.set(m.mutationId, { mutation: m, rev: nextRev() });
			}
			return { success: [], error };
		},
		find: () => ({ exec: async () => [...store.keys()].map((id) => docFor(id)!) }),
		bulkRemove: async (ids: string[]) => {
			for (const id of ids) store.delete(id);
			return { error: [] };
		},
	};
}
