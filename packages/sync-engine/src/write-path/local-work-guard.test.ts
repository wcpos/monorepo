// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { withoutLocallyProtected } from './local-work-guard';

function collectionWith(stored: Record<string, unknown>) {
	return {
		findByIds: (ids: string[]) => ({
			exec: async () =>
				new Map(
					ids.filter((id) => id in stored).map((id) => [id, { toJSON: () => stored[id] }] as const)
				),
		}),
	};
}

describe('withoutLocallyProtected', () => {
	// Trickle and change-signal callers read Symbol-borne manifest metadata off the
	// SURVIVING documents (manifestRowOf, #1340/#1345). Non-enumerable Symbols do not
	// survive a spread or rebuild, so this guard must FILTER the caller's own object
	// references, never reconstruct them. Reference identity is the contract.
	it('returns the caller’s own references, dropping only locally-protected rows', async () => {
		const kept = { uuid: 'kept' };
		const clean = { uuid: 'clean' };
		const protectedDoc = { uuid: 'protected' };
		const result = await withoutLocallyProtected(
			collectionWith({
				protected: { local: { dirty: true, pendingMutationIds: [] } },
				clean: { local: { dirty: false, pendingMutationIds: [] } },
			}),
			[kept, protectedDoc, clean]
		);
		expect(result).toHaveLength(2);
		expect(result[0]).toBe(kept);
		expect(result[1]).toBe(clean);
	});

	it('short-circuits to the same array when nothing is resident', async () => {
		const documents = [{ uuid: 'a' }, { uuid: 'b' }];
		expect(await withoutLocallyProtected(collectionWith({}), documents)).toBe(documents);
	});

	it('treats pending mutation ids as local work even when not dirty', async () => {
		const incoming = { uuid: 'queued' };
		const result = await withoutLocallyProtected(
			collectionWith({ queued: { local: { dirty: false, pendingMutationIds: ['m1'] } } }),
			[incoming]
		);
		expect(result).toEqual([]);
	});
});
