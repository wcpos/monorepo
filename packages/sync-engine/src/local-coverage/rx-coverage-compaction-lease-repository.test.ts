// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { RxCoverageCompactionLeaseRepository } from './rx-coverage-compaction-lease-repository';

import type { CoverageCompactionLease } from '../scheduler/coverage-compaction-cadence';

function lease(overrides: Partial<CoverageCompactionLease> = {}): CoverageCompactionLease {
	return { ownerId: 'tab-a', acquiredAtMs: 1_000, expiresAtMs: 1_500, ...overrides };
}

type LeaseDocument = CoverageCompactionLease & {
	leaseKey: string;
	schemaVersion?: 1;
	_deleted?: boolean;
};

function createCollection(initial?: LeaseDocument) {
	let stored: LeaseDocument | null = initial ? { ...initial } : null;
	const insert = vi.fn(async (item: LeaseDocument) => {
		if (stored) throw Object.assign(new Error('conflict'), { code: 'CONFLICT' });
		stored = { ...item };
	});
	const findOne = vi.fn((_documentId: string) => ({
		exec: vi.fn(async (includeDeleted = false) => {
			if (!stored || (stored._deleted && !includeDeleted)) return null;
			return {
				toJSON: () => {
					const { _deleted: _deleted, ...json } = stored!;
					return json;
				},
				incrementalModify: vi.fn(
					async (
						mutator: (
							current: LeaseDocument & { _deleted?: boolean }
						) => LeaseDocument & { _deleted?: boolean }
					) => {
						const current = { ...stored! };
						const next = mutator(current);
						if (current._deleted && next._deleted === undefined) {
							next._deleted = current._deleted;
						}
						stored = { ...next };
					}
				),
			};
		}),
	}));
	return {
		collection: { insert, findOne },
		get stored() {
			return stored;
		},
		insert,
		findOne,
	};
}

function repositoryFor(initial?: LeaseDocument) {
	const fixture = createCollection(initial);
	const repository = new RxCoverageCompactionLeaseRepository({
		coverageCompactionLeases: fixture.collection,
	} as never);
	return { repository, fixture };
}

describe('RxCoverageCompactionLeaseRepository', () => {
	it('reads the singleton coverage compaction lease', async () => {
		const current = { leaseKey: 'coverage-compaction', ...lease() };
		const { repository } = repositoryFor(current);

		await expect(repository.readLease()).resolves.toEqual(lease());
	});

	it('claims the singleton lease when no lease exists', async () => {
		const { repository, fixture } = repositoryFor();
		const next = lease({ ownerId: 'tab-b' });

		await expect(repository.claimLease(next, null)).resolves.toEqual(next);

		expect(fixture.stored).toEqual({ leaseKey: 'coverage-compaction', ...next, schemaVersion: 1 });
	});

	it('replaces the lease only when the stored lease still matches the expected lease', async () => {
		const expected = lease({ ownerId: 'tab-a', acquiredAtMs: 1_000, expiresAtMs: 1_100 });
		const next = lease({ ownerId: 'tab-b', acquiredAtMs: 1_200, expiresAtMs: 1_500 });
		const { repository, fixture } = repositoryFor({ leaseKey: 'coverage-compaction', ...expected });

		await expect(repository.claimLease(next, expected)).resolves.toEqual(next);

		expect(fixture.stored).toEqual({ leaseKey: 'coverage-compaction', ...next, schemaVersion: 1 });
	});

	it('does not claim over a newer lease', async () => {
		const expected = lease({ ownerId: 'tab-a', acquiredAtMs: 1_000, expiresAtMs: 1_100 });
		const newer = lease({ ownerId: 'tab-c', acquiredAtMs: 1_150, expiresAtMs: 1_600 });
		const next = lease({ ownerId: 'tab-b', acquiredAtMs: 1_200, expiresAtMs: 1_500 });
		const { repository, fixture } = repositoryFor({ leaseKey: 'coverage-compaction', ...newer });

		await expect(repository.claimLease(next, expected)).resolves.toBeNull();

		expect(fixture.stored).toEqual({ leaseKey: 'coverage-compaction', ...newer });
	});

	it('releases only the current owner lease', async () => {
		const current = lease({ ownerId: 'tab-a' });
		const { repository, fixture } = repositoryFor({ leaseKey: 'coverage-compaction', ...current });

		await repository.releaseLease('tab-b');
		expect(fixture.stored).toEqual({ leaseKey: 'coverage-compaction', ...current });

		await repository.releaseLease('tab-a');
		await expect(repository.readLease()).resolves.toEqual({ ...current, expiresAtMs: 0 });
		expect(fixture.stored).toEqual({ leaseKey: 'coverage-compaction', ...current, expiresAtMs: 0 });
	});

	it('can claim a deleted singleton lease tombstone left by the previous release behavior', async () => {
		const previous = lease({ ownerId: 'tab-a' });
		const next = lease({ ownerId: 'tab-b', acquiredAtMs: 2_000, expiresAtMs: 2_500 });
		const { repository, fixture } = repositoryFor({
			leaseKey: 'coverage-compaction',
			...previous,
			_deleted: true,
		});

		await expect(repository.readLease()).resolves.toBeNull();
		await expect(repository.claimLease(next, null)).resolves.toEqual(next);

		expect(fixture.stored).toEqual({
			leaseKey: 'coverage-compaction',
			...next,
			schemaVersion: 1,
			_deleted: false,
		});
		await expect(repository.readLease()).resolves.toEqual(next);
	});

	it('can claim the singleton lease after the previous owner released it', async () => {
		const current = lease({ ownerId: 'tab-a' });
		const next = lease({ ownerId: 'tab-b', acquiredAtMs: 2_000, expiresAtMs: 2_500 });
		const { repository, fixture } = repositoryFor({ leaseKey: 'coverage-compaction', ...current });

		await repository.releaseLease('tab-a');
		const releasedLease = await repository.readLease();

		await expect(repository.claimLease(next, releasedLease)).resolves.toEqual(next);
		expect(fixture.stored).toEqual({ leaseKey: 'coverage-compaction', ...next, schemaVersion: 1 });
		await expect(repository.readLease()).resolves.toEqual(next);
	});
});
