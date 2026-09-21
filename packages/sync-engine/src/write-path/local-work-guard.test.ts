// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { withoutLocallyProtected, withoutUnchanged } from './local-work-guard';

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
	// Trickle and change-signal callers pair the SURVIVORS back against the materialization
	// envelopes that produced them, to record manifest rows for exactly the documents they
	// stored (#1340/#1345). This guard filters the caller's own array and rebuilds nothing —
	// a reconstructed document would be a second identity for the same pulled record.
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

describe('withoutUnchanged', () => {
	it.each([
		[{ uuid: 'a', payload: { a: 1, b: [2, 3] } }, false],
		[
			{
				uuid: 'a',
				payload: { b: [2, 3], a: 1 },
				_rev: '2-x',
				_meta: {},
				_attachments: {},
				_deleted: false,
			},
			false,
		],
		[{ uuid: 'a', payload: { a: 1, b: [2, 3] }, _deleted: true }, true],
		[{ uuid: 'a', payload: { a: 1, b: [3, 2] } }, true],
		[{ uuid: 'a', payload: { a: 1, b: [2, 3] }, extra: null }, true],
		[{ uuid: 'a', payload: { a: 1, b: [2, 3], extra: null } }, true],
		[undefined, true],
	])('conservatively compares resident JSON %j', (resident, changed) => {
		const incoming = { uuid: 'a', payload: { a: 1, b: [2, 3] } };
		const stored = new Map([['a', { toJSON: () => resident }]]);
		expect(withoutUnchanged(collectionWith({}), stored, [incoming])).toEqual(
			changed ? [incoming] : []
		);
	});

	it('applies schema fill methods and writes on uncertain comparisons', () => {
		const incoming = { uuid: 'a' };
		const stored = new Map([['a', { toJSON: () => ({ uuid: 'a', enabled: false }) }]]);
		const collection = {
			...collectionWith({}),
			schema: {
				fillObjectWithDefaults: (doc: Record<string, unknown>) =>
					Object.assign(doc, { enabled: false }),
			},
		};
		expect(withoutUnchanged(collection, stored, [incoming])).toEqual([]);
		expect(incoming).toEqual({ uuid: 'a' });
		collection.schema.fillObjectWithDefaults = () => {
			throw new Error('cannot fill');
		};
		expect(withoutUnchanged(collection, stored, [incoming])).toEqual([incoming]);
		expect(withoutUnchanged({ ...collection, schema: {} }, stored, [incoming])).toEqual([incoming]);
	});
});
