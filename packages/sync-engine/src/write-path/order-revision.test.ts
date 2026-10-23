/**
 * The order revision door (ADR 0040 §1.3): a naked stamp moves `sync.revision` and leaves
 * `sync.adopted` behind; a whole-document adoption binds `adopted` to the revision; a reader
 * holds the document only while the two agree and the adoption is newer than the last answer.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createEngineHarness } from '../engine-harness';
import { remoteId } from '../testing';
import {
	adoptedSync,
	createOrderRevisionDoor,
	residentRevision,
	stampedSync,
} from './order-revision';

import type { RxDatabase } from 'rxdb';

setPremiumFlag();
afterEach(createEngineHarness.disposeTrackedEngines);

const ADOPTED = { revision: 'sha256:r1', at: 100 };
const SYNC = { revision: 'sha256:r1', partial: false, source: 'woo-rest', adopted: ADOPTED };

describe('stampedSync', () => {
	it.each([
		{
			name: 'moves the revision and keeps adopted',
			sync: SYNC,
			expected: { ...SYNC, revision: 'sha256:r2' },
		},
		{
			name: "is unconditional: the yield to a newer adoption is the door's",
			sync: { ...SYNC, adopted: { ...ADOPTED, at: Number.MAX_SAFE_INTEGER } },
			expected: {
				...SYNC,
				revision: 'sha256:r2',
				adopted: { ...ADOPTED, at: Number.MAX_SAFE_INTEGER },
			},
		},
		{
			name: 'stamps a resident that was never adopted',
			sync: { revision: 'sha256:r1' },
			expected: { revision: 'sha256:r2' },
		},
	])('$name', ({ sync, expected }) => {
		expect(stampedSync(sync, 'sha256:r2')).toEqual(expected);
	});
});

describe('adoptedSync', () => {
	it.each([
		{
			name: 'binds adopted to the revision it carries',
			sync: { revision: 'sha256:r2', adopted: ADOPTED },
			expected: { revision: 'sha256:r2', adopted: { revision: 'sha256:r2', at: 500 } },
		},
		{
			name: 'is a no-op on an empty revision',
			sync: { revision: '', adopted: ADOPTED },
			expected: { revision: '', adopted: ADOPTED },
		},
		{
			name: 'is a no-op without a revision',
			sync: { partial: false },
			expected: { partial: false },
		},
	])('$name', ({ sync, expected }) => {
		expect(adoptedSync(sync, 500)).toEqual(expected);
	});
});

describe('residentRevision', () => {
	it.each([
		{ name: 'no answer: adopted under the stamp', sync: SYNC, answeredAt: undefined, holds: true },
		{ name: 'adopted after the answer', sync: SYNC, answeredAt: 99, holds: true },
		{ name: 'adopted at the answer', sync: SYNC, answeredAt: 100, holds: false },
		{ name: 'adopted before the answer', sync: SYNC, answeredAt: 101, holds: false },
		{ name: 'no revision', sync: { adopted: ADOPTED }, answeredAt: undefined, holds: false },
		{
			name: 'a naked stamp past the adoption',
			sync: { ...SYNC, revision: 'sha256:r2' },
			answeredAt: undefined,
			holds: false,
		},
		{ name: 'never adopted', sync: { revision: 'sha256:r1' }, answeredAt: undefined, holds: false },
	])('holdsDocument: $name', ({ sync, answeredAt, holds }) => {
		expect(residentRevision({ sync }).holdsDocument(answeredAt)).toBe(holds);
	});

	it('reads a record without sync as no revision and no adoption', () => {
		expect(residentRevision({})).toMatchObject({ revision: undefined, adopted: null });
		expect(residentRevision(null)).toMatchObject({ revision: undefined, adopted: null });
	});
});

describe('the door: stamp', () => {
	const UUID = '33333333-3333-4333-8333-333333333333';

	async function doorOver(sync: Record<string, unknown> | null) {
		const harness = await createEngineHarness();
		const orders = harness.collection('orders');
		if (sync)
			await orders.insert({
				posUserId: '',
				posStoreId: '',
				uuid: UUID,
				remoteId: remoteId(42),
				remoteKey: String(remoteId(42) ?? ''),
				number: '1042',
				dateCreatedGmt: '2026-07-10T00:00:00',
				status: 'on-hold',
				total: '10.00',
				customerId: 0,
				payload: { id: 42, status: 'on-hold', total: '10.00' },
				sync,
				local: { dirty: false, pendingMutationIds: [] },
			});
		const door = createOrderRevisionDoor({
			resolveDatabase: async () => orders.database as unknown as RxDatabase,
		});
		const residentSync = async () =>
			((await orders.findOne(UUID).exec())?.toJSON() as { sync: unknown }).sync;
		return { door, residentSync };
	}

	it('stamps the answer revision, keeps the adoption and reports the revision it replaced', async () => {
		const { door, residentSync } = await doorOver(SYNC);
		expect(await door.stamp(UUID, 'sha256:r2', 200)).toEqual({ replaced: 'sha256:r1' });
		expect(await residentSync()).toEqual({ ...SYNC, revision: 'sha256:r2' });
	});

	it('is a no-op under an equal revision', async () => {
		const { door, residentSync } = await doorOver(SYNC);
		expect(await door.stamp(UUID, 'sha256:r1', 200)).toEqual({ replaced: null });
		expect(await residentSync()).toEqual(SYNC);
	});

	it.each([
		{ name: 'yields to an adoption newer than the answer', answeredAt: 99, stamps: false },
		{
			name: 'stamps over an adoption at the same instant as the answer',
			answeredAt: 100,
			stamps: true,
		},
	])('$name', async ({ answeredAt, stamps }) => {
		const { door, residentSync } = await doorOver(SYNC);
		expect(await door.stamp(UUID, 'sha256:r2', answeredAt)).toEqual({
			replaced: stamps ? 'sha256:r1' : null,
		});
		expect(await residentSync()).toEqual(stamps ? { ...SYNC, revision: 'sha256:r2' } : SYNC);
	});

	it('throws when the resident is missing', async () => {
		const { door } = await doorOver(null);
		await expect(door.stamp(UUID, 'sha256:r2', 200)).rejects.toThrow(
			`Engine resident "${UUID}" is missing from "orders"`
		);
	});
});
