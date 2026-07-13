import {
	type CoverageCompactionCadenceDecision,
	type CoverageCompactionFailure,
	type CoverageCompactionLease,
	planCoverageCompactionCadence,
} from '../scheduler/coverage-compaction-cadence';

import type {
	PersistedCoverageCompactionResult,
	PersistedCoverageDocumentSet,
} from '../scheduler/persisted-coverage-schema';

export type CoverageCompactionMaintenanceRepository = {
	readCoverageDocuments(): Promise<PersistedCoverageDocumentSet>;
	compactRetention(input: {
		nowMs: number;
		retainStaleForMs: number;
	}): Promise<PersistedCoverageCompactionResult>;
};

export type CoverageCompactionLeaseStore = {
	readLease(): Promise<CoverageCompactionLease | null>;
	claimLease(
		lease: CoverageCompactionLease,
		expectedLease: CoverageCompactionLease | null
	): Promise<CoverageCompactionLease | null>;
	releaseLease(ownerId: string): Promise<void>;
};

export type CoverageCompactionFailureStore = {
	readFailure(): Promise<CoverageCompactionFailure | null>;
	recordFailure(failure: CoverageCompactionFailure): Promise<void>;
	clearFailure(): Promise<void>;
};

export type CoverageCompactionMaintenanceInput = {
	repository: CoverageCompactionMaintenanceRepository;
	leaseStore: CoverageCompactionLeaseStore;
	failureStore: CoverageCompactionFailureStore;
	tabId: string;
	nowMs: number;
	intervalMs: number;
	retainStaleForMs: number;
	minExpiredDocuments: number;
	lastCompactedAtMs: number | null;
	leaseTtlMs: number;
	failureBackoffMs: number;
};

export type CoverageCompactionMaintenanceResult =
	| {
			status: 'skipped';
			decision: CoverageCompactionCadenceDecision;
			removed: 0;
	  }
	| {
			status: 'compacted';
			decision: CoverageCompactionCadenceDecision;
			compaction: PersistedCoverageCompactionResult;
			removed: number;
	  };

function nextLease(input: CoverageCompactionMaintenanceInput): CoverageCompactionLease {
	return {
		ownerId: input.tabId,
		acquiredAtMs: input.nowMs,
		expiresAtMs: input.nowMs + input.leaseTtlMs,
	};
}

export async function runCoverageCompactionMaintenance(
	input: CoverageCompactionMaintenanceInput
): Promise<CoverageCompactionMaintenanceResult> {
	const [documents, lease, failedCompaction] = await Promise.all([
		input.repository.readCoverageDocuments(),
		input.leaseStore.readLease(),
		input.failureStore.readFailure(),
	]);
	const decision = planCoverageCompactionCadence({
		tabId: input.tabId,
		documents,
		nowMs: input.nowMs,
		intervalMs: input.intervalMs,
		retainStaleForMs: input.retainStaleForMs,
		minExpiredDocuments: input.minExpiredDocuments,
		lastCompactedAtMs: input.lastCompactedAtMs,
		lease,
		failedCompaction,
	});

	if (
		decision.action === 'skip' ||
		decision.action === 'wait-for-owner' ||
		decision.action === 'wait-for-failure-backoff'
	) {
		return { status: 'skipped', decision, removed: 0 };
	}

	const claimedLease = await input.leaseStore.claimLease(nextLease(input), lease);
	if (!claimedLease) {
		return { status: 'skipped', decision, removed: 0 };
	}

	try {
		let compaction: PersistedCoverageCompactionResult;
		try {
			compaction = await input.repository.compactRetention({
				nowMs: input.nowMs,
				retainStaleForMs: input.retainStaleForMs,
			});
		} catch (error: unknown) {
			const failedAtMs = input.nowMs;
			await input.failureStore.recordFailure({
				failedAtMs,
				retryAfterMs: failedAtMs + input.failureBackoffMs,
			});
			throw error;
		}

		await input.failureStore.clearFailure();
		return {
			status: 'compacted',
			decision,
			compaction,
			removed: compaction.removed.length,
		};
	} finally {
		await input.leaseStore.releaseLease(input.tabId);
	}
}
