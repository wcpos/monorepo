import {
	type PersistedCoverageDocumentSet,
	planPersistedCoverageRetention,
} from './persisted-coverage-schema';

export type CoverageCompactionLease = {
	ownerId: string;
	acquiredAtMs: number;
	expiresAtMs: number;
};

export type CoverageCompactionFailure = {
	failedAtMs: number;
	retryAfterMs: number;
};

export type CoverageCompactionCadenceInput = {
	tabId: string;
	documents: PersistedCoverageDocumentSet;
	nowMs: number;
	intervalMs: number;
	retainStaleForMs: number;
	minExpiredDocuments: number;
	lastCompactedAtMs: number | null;
	lease?: CoverageCompactionLease | null;
	failedCompaction?: CoverageCompactionFailure | null;
};

export type CoverageCompactionCadenceAction =
	| 'run'
	| 'skip'
	| 'wait-for-owner'
	| 'take-over'
	| 'wait-for-failure-backoff';

export type CoverageCompactionCadenceDecision = {
	action: CoverageCompactionCadenceAction;
	reason: string;
	expiredDocuments: number;
	refreshableDocuments: number;
	keepDocuments: number;
	ownerId?: string;
	previousOwnerId?: string;
	nextDueAtMs: number;
};

function activeLease(input: CoverageCompactionCadenceInput): CoverageCompactionLease | null {
	return input.lease && input.lease.expiresAtMs > input.nowMs ? input.lease : null;
}

export function planCoverageCompactionCadence(
	input: CoverageCompactionCadenceInput
): CoverageCompactionCadenceDecision {
	const decisions = planPersistedCoverageRetention({
		documents: input.documents,
		nowMs: input.nowMs,
		retainStaleForMs: input.retainStaleForMs,
	});
	const expiredDocuments = decisions.filter((decision) => decision.action === 'remove').length;
	const refreshableDocuments = decisions.filter((decision) => decision.action === 'refresh').length;
	const keepDocuments = decisions.filter((decision) => decision.action === 'keep').length;
	const nextDueAtMs =
		input.lastCompactedAtMs === null ? input.nowMs : input.lastCompactedAtMs + input.intervalMs;
	const dueByInterval = input.lastCompactedAtMs === null || input.nowMs >= nextDueAtMs;
	const meetsThreshold = expiredDocuments >= input.minExpiredDocuments;

	if (!dueByInterval) {
		return {
			action: 'skip',
			reason: 'compaction interval has not elapsed',
			expiredDocuments,
			refreshableDocuments,
			keepDocuments,
			nextDueAtMs,
		};
	}

	if (!meetsThreshold) {
		return {
			action: 'skip',
			reason: 'no expired persisted coverage documents meet the compaction threshold',
			expiredDocuments,
			refreshableDocuments,
			keepDocuments,
			nextDueAtMs,
		};
	}

	if (input.failedCompaction && input.failedCompaction.retryAfterMs > input.nowMs) {
		return {
			action: 'wait-for-failure-backoff',
			reason: 'previous compaction failure is still inside retry backoff',
			expiredDocuments,
			refreshableDocuments,
			keepDocuments,
			nextDueAtMs: input.failedCompaction.retryAfterMs,
		};
	}

	const currentLease = activeLease(input);
	if (currentLease && currentLease.ownerId !== input.tabId) {
		return {
			action: 'wait-for-owner',
			reason: 'another tab owns the active compaction lease',
			expiredDocuments,
			refreshableDocuments,
			keepDocuments,
			ownerId: currentLease.ownerId,
			nextDueAtMs,
		};
	}

	if (
		input.lease &&
		input.lease.ownerId !== input.tabId &&
		input.lease.expiresAtMs <= input.nowMs
	) {
		return {
			action: 'take-over',
			reason: 'previous compaction lease expired',
			expiredDocuments,
			refreshableDocuments,
			keepDocuments,
			ownerId: input.tabId,
			previousOwnerId: input.lease.ownerId,
			nextDueAtMs,
		};
	}

	return {
		action: 'run',
		reason: 'expired persisted coverage is due for compaction',
		expiredDocuments,
		refreshableDocuments,
		keepDocuments,
		ownerId: input.tabId,
		nextDueAtMs,
	};
}
