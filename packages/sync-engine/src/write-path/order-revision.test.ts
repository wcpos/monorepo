/**
 * The order revision door (ADR 0040 §1.3): a naked stamp moves `sync.revision` and leaves
 * `sync.adopted` behind; a whole-document adoption binds `adopted` to the revision; a reader
 * holds the document only while the two agree and the adoption is newer than the last answer.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createEngineHarness } from '../engine-harness';
import { remoteId } from '../testing';
import {
	adoptedSync,
	carriedFacts,
	createOrderRevisionDoor,
	residentRevision,
	stampedSync,
} from './order-revision';

import type { CoverageOutcome, EngineRequirement, RequirementHandle } from '../require-plane';
import type { RxDatabase } from 'rxdb';

setPremiumFlag();
afterEach(createEngineHarness.disposeTrackedEngines);

const ADOPTED = { revision: 'sha256:r1', at: 100 };
const SYNC = {
	revision: 'sha256:r1',
	partial: false,
	source: 'woo-rest' as const,
	adopted: ADOPTED,
};

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
		{
			name: "clears the last poll's stamp",
			sync: { revision: 'sha256:r2', stamped: { at: 400 } },
			expected: { revision: 'sha256:r2', adopted: { revision: 'sha256:r2', at: 500 } },
		},
	])('$name', ({ sync, expected }) => {
		expect(adoptedSync(sync, 500)).toEqual(expected);
	});
});

describe('carriedFacts', () => {
	it.each([
		{
			name: "carries the resident's adoption and stamp onto the pulled sync",
			resident: { ...SYNC, stamped: { at: 200 } },
			expected: {
				revision: 'sha256:r9',
				adopted: ADOPTED,
				stamped: { at: 200 },
			},
		},
		{
			name: 'adds nothing for a resident without them',
			resident: { revision: 'sha256:r1' },
			expected: { revision: 'sha256:r9' },
		},
		{
			name: 'adds nothing without a resident',
			resident: undefined,
			expected: { revision: 'sha256:r9' },
		},
	])('$name', ({ resident, expected }) => {
		expect(carriedFacts({ revision: 'sha256:r9' }, resident && { sync: resident })).toEqual(
			expected
		);
	});

	it.each([
		{ name: 'a stamp that landed since the adoption', stamped: { at: 500 }, carried: true },
		{ name: 'a stamp at the adoption', stamped: { at: 400 }, carried: true },
		{ name: 'a stamp older than the adoption', stamped: { at: 399 }, carried: false },
	])('at the write, carries only $name', ({ stamped, carried }) => {
		const current = { sync: { ...SYNC, stamped } };
		expect(carriedFacts({ revision: 'sha256:r9' }, current, 400)).toEqual(
			carried ? { revision: 'sha256:r9', stamped } : { revision: 'sha256:r9' }
		);
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
		{
			name: "a poll's stamp at or after the adoption, under an equal revision",
			sync: { ...SYNC, stamped: { at: 100 } },
			answeredAt: undefined,
			holds: false,
		},
		{
			name: "a poll's stamp newer than the chain's answer",
			sync: { ...SYNC, stamped: { at: 150 } },
			answeredAt: 50,
			holds: false,
		},
		{
			name: "adopted after both the answer and the poll's stamp",
			sync: { ...SYNC, stamped: { at: 60 } },
			answeredAt: 50,
			holds: true,
		},
	])('holdsDocument: $name', ({ sync, answeredAt, holds }) => {
		expect(residentRevision({ sync }).holdsDocument(answeredAt)).toBe(holds);
	});

	it.each([
		{
			name: 'adopted after it, a stamp later',
			sync: { ...SYNC, stamped: { at: 150 } },
			at: 99,
			after: true,
		},
		{ name: 'adopted at it', sync: SYNC, at: 100, after: false },
		// A pull requested before the adoption stays out though a naked stamp moved the revision.
		{
			name: 'adopted after it, then a naked stamp r2',
			sync: { ...SYNC, revision: 'sha256:r2' },
			at: 99,
			after: true,
		},
		{ name: 'never adopted', sync: { revision: 'sha256:r1' }, at: 0, after: false },
	])("adoptedAfter answers time only (the pull guard's question): $name", ({ sync, at, after }) => {
		expect(residentRevision({ sync }).adoptedAfter(at)).toBe(after);
	});

	it.each([
		{
			name: 'a stamp after the chain',
			sync: { ...SYNC, stamped: { at: 150 } },
			answeredAt: 120,
			polled: true,
		},
		{
			name: 'a stamp and no chain',
			sync: { ...SYNC, stamped: { at: 150 } },
			answeredAt: undefined,
			polled: true,
		},
		{
			name: 'the chain answered after the stamp',
			sync: { ...SYNC, stamped: { at: 150 } },
			answeredAt: 150,
			polled: false,
		},
		{ name: 'no stamp', sync: SYNC, answeredAt: undefined, polled: false },
	])('polledAfter: $name', ({ sync, answeredAt, polled }) => {
		expect(residentRevision({ sync }).polledAfter(answeredAt)).toBe(polled);
	});

	it('reads a record without sync as no revision and no adoption', () => {
		expect(residentRevision({})).toMatchObject({
			revision: undefined,
			adopted: null,
		});
		expect(residentRevision(null)).toMatchObject({
			revision: undefined,
			adopted: null,
		});
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
			require: () => {
				throw new Error('stamp never requires');
			},
		});
		const residentSync = async () =>
			((await orders.findOne(UUID).exec())?.toJSON() as { sync: unknown }).sync;
		return { door, residentSync };
	}

	it('stamps the answer revision, keeps the adoption, records the stamp and reports the revision it replaced', async () => {
		const { door, residentSync } = await doorOver(SYNC);
		expect(await door.stamp(UUID, 'sha256:r2', 200)).toEqual({ replaced: 'sha256:r1' });
		expect(await residentSync()).toEqual({
			...SYNC,
			revision: 'sha256:r2',
			stamped: { at: 200 },
		});
	});

	it('under an equal revision replaces nothing and still records the stamp', async () => {
		const { door, residentSync } = await doorOver(SYNC);
		expect(await door.stamp(UUID, 'sha256:r1', 200)).toEqual({ replaced: null });
		expect(await residentSync()).toEqual({ ...SYNC, stamped: { at: 200 } });
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
		expect(await residentSync()).toEqual(
			stamps ? { ...SYNC, revision: 'sha256:r2', stamped: { at: answeredAt } } : SYNC
		);
	});

	it('refuses an empty revision, as an adoption does', async () => {
		const { door, residentSync } = await doorOver(SYNC);
		expect(await door.stamp(UUID, '', 200)).toEqual({ replaced: null });
		expect(await residentSync()).toEqual(SYNC);
	});

	it('throws when the resident is missing', async () => {
		const { door } = await doorOver(null);
		await expect(door.stamp(UUID, 'sha256:r2', 200)).rejects.toThrow(
			`Engine resident "${UUID}" is missing from "orders"`
		);
	});
});

describe('the door: readopt', () => {
	function doorAnswering(ready: () => Promise<CoverageOutcome>) {
		const requirements: EngineRequirement[] = [];
		let released = 0;
		const door = createOrderRevisionDoor({
			resolveDatabase: async () => {
				throw new Error('readopt never reads the resident');
			},
			require: (requirement): RequirementHandle => {
				requirements.push(requirement);
				return { ready: ready(), release: () => (released += 1), queryKey: null };
			},
		});
		return { door, requirements, released: () => released };
	}
	const fetched = (appliedRecordIds?: string[]): CoverageOutcome => ({
		action: 'fetched',
		missingRecordIds: [],
		reason: 'orders refreshed',
		...(appliedRecordIds ? { appliedRecordIds } : {}),
	});

	it.each([
		{ name: "this refresh's own task wrote it", ready: async () => fetched(['42']), adopted: true },
		{
			name: 'its task wrote nothing (the local-work guard kept the resident)',
			ready: async () => fetched([]),
			adopted: false,
		},
		{ name: 'no applied ids reported', ready: async () => fetched(), adopted: false },
		{ name: 'another order was written', ready: async () => fetched(['43']), adopted: false },
		{
			name: 'released',
			ready: async (): Promise<CoverageOutcome> => ({
				action: 'released',
				missingRecordIds: [],
				reason: 'scope moved',
			}),
			adopted: false,
		},
		{
			name: 'the refresh failed',
			ready: async (): Promise<CoverageOutcome> => {
				throw new Error('offline');
			},
			adopted: false,
		},
	])('$name: $adopted, the demand released', async ({ ready, adopted }) => {
		const { door, requirements, released } = doorAnswering(ready);
		expect(await door.readopt(42)).toBe(adopted);
		expect(requirements).toEqual([
			expect.objectContaining({
				collection: 'orders',
				kind: 'targeted-records',
				remoteIds: ['42'],
				forceRefresh: true,
				readopt: true,
			}),
		]);
		expect(released()).toBe(1);
	});

	it('an engine that cannot take the request is no adoption', async () => {
		const door = createOrderRevisionDoor({
			resolveDatabase: async () => {
				throw new Error('unused');
			},
			require: () => {
				throw new Error('No active store scope');
			},
		});
		expect(await door.readopt(42)).toBe(false);
	});
});

describe('the one writer', () => {
	const sourceRoot = join(__dirname, '..');
	const sourceFiles = (directory: string): string[] =>
		readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) return sourceFiles(path);
			return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
		});
	// A key with any value, a shorthand key after a spread, or an assignment: every shape a write
	// of the facts takes. A destructuring read is none of them, nor an `unknown` parameter.
	const WRITE =
		/\b(?:adopted|stamped)\s*:(?!\s*unknown\b)|\.\.\.[^{}]*?,\s*(?:adopted|stamped)\s*[,}]|\.(?:adopted|stamped)\s*=(?!=)/g;

	it('no sync-engine source outside order-revision.ts writes sync.adopted or sync.stamped', () => {
		const writes = sourceFiles(sourceRoot).flatMap((path) => {
			const file = relative(sourceRoot, path);
			if (file === join('write-path', 'order-revision.ts')) return [];
			return (readFileSync(path, 'utf8').match(WRITE) ?? []).map((match) => `${file}: ${match}`);
		});
		expect(writes).toEqual([]);
	});

	it('the scan sees each shape', () => {
		for (const write of [
			'{ adopted: { revision } }',
			'{ adopted: resident.sync.adopted }',
			'{ ...sync, stamped }',
			'{ ...s, revision, adopted }',
			'sync.adopted = at',
		])
			expect(write.match(WRITE)).not.toBeNull();
		expect('function newer(incoming: X, adopted: unknown) {}'.match(WRITE)).toBeNull();
		expect('const { adopted, stamped } = facts;'.match(WRITE)).toBeNull();
	});
});
