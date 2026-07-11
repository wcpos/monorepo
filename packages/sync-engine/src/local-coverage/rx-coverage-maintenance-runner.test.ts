// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
	type CoverageCompactionFailureStore,
	type CoverageCompactionLeaseStore,
	type CoverageCompactionMaintenanceRepository,
	runCoverageCompactionMaintenance,
} from './compaction';

import type {
	CoverageCompactionFailure,
	CoverageCompactionLease,
} from '../scheduler/coverage-compaction-cadence';
import type { PersistedCoverageDocumentSet } from '../scheduler/persisted-coverage-schema';

const freshLane = {
	collection: 'orders',
	queryKey: 'orders:open',
	complete: true,
	expectedRecordIds: ['order-1'],
	freshUntilMs: 2_000,
	updatedAtMs: 1_000,
};
const expiredRecord = {
	collection: 'orders',
	id: 'order-expired',
	coveredQueryKeys: ['orders:open'],
	freshUntilMs: 700,
	updatedAtMs: 600,
};
const refreshableRecord = {
	collection: 'orders',
	id: 'order-refresh',
	coveredQueryKeys: ['orders:open'],
	freshUntilMs: 950,
	updatedAtMs: 900,
};

const baseInput = {
	tabId: 'tab-a',
	nowMs: 1_000,
	intervalMs: 300,
	retainStaleForMs: 100,
	minExpiredDocuments: 1,
	lastCompactedAtMs: 500,
	leaseTtlMs: 250,
	failureBackoffMs: 300,
};

function createRepository(
	documents: PersistedCoverageDocumentSet
): CoverageCompactionMaintenanceRepository {
	return {
		readCoverageDocuments: vi.fn(async () => documents),
		compactRetention: vi.fn(async () => ({
			decisions: [],
			documents: { records: [], lanes: [freshLane] },
			removed: [
				{
					documentType: 'record' as const,
					collection: 'orders',
					key: 'order-expired',
					action: 'remove' as const,
					reason: 'coverage is stale beyond retention window',
				},
			],
		})),
	};
}

function createLeaseStore(
	lease: CoverageCompactionLease | null = null
): CoverageCompactionLeaseStore {
	return {
		readLease: vi.fn(async () => lease),
		claimLease: vi.fn(async (nextLease) => {
			lease = nextLease;
			return nextLease;
		}),
		releaseLease: vi.fn(async (ownerId) => {
			if (lease?.ownerId === ownerId) lease = null;
		}),
	};
}

function createFailureStore(
	failure: CoverageCompactionFailure | null = null
): CoverageCompactionFailureStore {
	return {
		readFailure: vi.fn(async () => failure),
		recordFailure: vi.fn(async (nextFailure) => {
			failure = nextFailure;
		}),
		clearFailure: vi.fn(async () => {
			failure = null;
		}),
	};
}

describe('runCoverageCompactionMaintenance', () => {
	it('skips without claiming or compacting when stale coverage remains refreshable', async () => {
		const repository = createRepository({ records: [refreshableRecord], lanes: [freshLane] });
		const leaseStore = createLeaseStore();
		const failureStore = createFailureStore();

		const result = await runCoverageCompactionMaintenance({
			...baseInput,
			repository,
			leaseStore,
			failureStore,
		});

		expect(result.status).toBe('skipped');
		expect(result.decision.action).toBe('skip');
		expect(leaseStore.claimLease).not.toHaveBeenCalled();
		expect(repository.compactRetention).not.toHaveBeenCalled();
	});

	it('waits without claiming or compacting when another tab owns an active lease', async () => {
		const repository = createRepository({ records: [expiredRecord], lanes: [freshLane] });
		const leaseStore = createLeaseStore({
			ownerId: 'tab-b',
			acquiredAtMs: 900,
			expiresAtMs: 1_200,
		});
		const failureStore = createFailureStore();

		const result = await runCoverageCompactionMaintenance({
			...baseInput,
			repository,
			leaseStore,
			failureStore,
		});

		expect(result.status).toBe('skipped');
		expect(result.decision.action).toBe('wait-for-owner');
		expect(result.decision.ownerId).toBe('tab-b');
		expect(leaseStore.claimLease).not.toHaveBeenCalled();
		expect(repository.compactRetention).not.toHaveBeenCalled();
	});

	it('claims, compacts, releases, and reports removals when compaction can run', async () => {
		const repository = createRepository({ records: [expiredRecord], lanes: [freshLane] });
		const leaseStore = createLeaseStore();
		const failureStore = createFailureStore();

		const result = await runCoverageCompactionMaintenance({
			...baseInput,
			repository,
			leaseStore,
			failureStore,
		});

		expect(result.status).toBe('compacted');
		expect(result.decision.action).toBe('run');
		expect(leaseStore.claimLease).toHaveBeenCalledWith(
			{ ownerId: 'tab-a', acquiredAtMs: 1_000, expiresAtMs: 1_250 },
			null
		);
		expect(repository.compactRetention).toHaveBeenCalledWith({
			nowMs: 1_000,
			retainStaleForMs: 100,
		});
		expect(leaseStore.releaseLease).toHaveBeenCalledWith('tab-a');
		expect(failureStore.clearFailure).toHaveBeenCalled();
		expect(result.removed).toBe(1);
	});

	it('does not record compaction failure backoff when clearing stale failure state throws after compaction succeeds', async () => {
		const repository = createRepository({ records: [expiredRecord], lanes: [freshLane] });
		const leaseStore = createLeaseStore();
		const failureStore = createFailureStore();
		vi.mocked(failureStore.clearFailure).mockRejectedValueOnce(new Error('clear failed'));

		await expect(
			runCoverageCompactionMaintenance({ ...baseInput, repository, leaseStore, failureStore })
		).rejects.toThrow('clear failed');

		expect(repository.compactRetention).toHaveBeenCalledOnce();
		expect(failureStore.recordFailure).not.toHaveBeenCalled();
		expect(leaseStore.releaseLease).toHaveBeenCalledWith('tab-a');
	});

	it('releases the owned lease when compaction throws', async () => {
		const repository = createRepository({ records: [expiredRecord], lanes: [freshLane] });
		vi.mocked(repository.compactRetention).mockRejectedValueOnce(new Error('boom'));
		const leaseStore = createLeaseStore();
		const failureStore = createFailureStore();

		await expect(
			runCoverageCompactionMaintenance({ ...baseInput, repository, leaseStore, failureStore })
		).rejects.toThrow('boom');

		expect(leaseStore.claimLease).toHaveBeenCalledWith(
			{ ownerId: 'tab-a', acquiredAtMs: 1_000, expiresAtMs: 1_250 },
			null
		);
		expect(failureStore.recordFailure).toHaveBeenCalledWith({
			failedAtMs: 1_000,
			retryAfterMs: 1_300,
		});
		expect(leaseStore.releaseLease).toHaveBeenCalledWith('tab-a');
	});

	it('skips compaction when the durable lease claim is lost', async () => {
		const repository = createRepository({ records: [expiredRecord], lanes: [freshLane] });
		const leaseStore = createLeaseStore();
		const failureStore = createFailureStore();
		vi.mocked(leaseStore.claimLease).mockResolvedValueOnce(null);

		const result = await runCoverageCompactionMaintenance({
			...baseInput,
			repository,
			leaseStore,
			failureStore,
		});

		expect(result.status).toBe('skipped');
		expect(result.decision.action).toBe('run');
		expect(repository.compactRetention).not.toHaveBeenCalled();
		expect(leaseStore.releaseLease).not.toHaveBeenCalled();
	});

	it('waits through failed compaction backoff without claiming or compacting', async () => {
		const repository = createRepository({ records: [expiredRecord], lanes: [freshLane] });
		const leaseStore = createLeaseStore();
		const failureStore = createFailureStore({ failedAtMs: 900, retryAfterMs: 1_200 });

		const result = await runCoverageCompactionMaintenance({
			...baseInput,
			repository,
			leaseStore,
			failureStore,
		});

		expect(result.status).toBe('skipped');
		expect(result.decision.action).toBe('wait-for-failure-backoff');
		expect(leaseStore.claimLease).not.toHaveBeenCalled();
		expect(repository.compactRetention).not.toHaveBeenCalled();
	});

	it('takes over an expired lease before compacting', async () => {
		const repository = createRepository({ records: [expiredRecord], lanes: [freshLane] });
		const leaseStore = createLeaseStore({ ownerId: 'tab-b', acquiredAtMs: 400, expiresAtMs: 900 });
		const failureStore = createFailureStore();

		const result = await runCoverageCompactionMaintenance({
			...baseInput,
			repository,
			leaseStore,
			failureStore,
		});

		expect(result.status).toBe('compacted');
		expect(result.decision.action).toBe('take-over');
		expect(result.decision.previousOwnerId).toBe('tab-b');
		expect(leaseStore.claimLease).toHaveBeenCalledWith(
			{ ownerId: 'tab-a', acquiredAtMs: 1_000, expiresAtMs: 1_250 },
			{ ownerId: 'tab-b', acquiredAtMs: 400, expiresAtMs: 900 }
		);
		expect(repository.compactRetention).toHaveBeenCalledOnce();
	});
});
