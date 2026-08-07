import { isNeverPushedChain } from '@wcpos/sync-core';
import type { QueuedMutation } from '@wcpos/sync-core';

type WriteOperation = QueuedMutation['operation'];

export type WritePlacement =
	| { kind: 'refuse-recovery-superseded-by-delete' }
	| { kind: 'annihilate'; chain: readonly QueuedMutation[] }
	| { kind: 'coalesce'; prior: QueuedMutation; operation: WriteOperation }
	| { kind: 'append-if-unchanged'; observedIds: readonly string[] }
	| { kind: 'append'; deferBaseRevision: boolean };

export function decideWritePlacement(input: {
	rows: readonly QueuedMutation[];
	operation: WriteOperation;
	isRecovery: boolean;
	canCoalesce: boolean;
	hasBaseRevision: boolean;
}): WritePlacement {
	const { rows, operation, isRecovery, canCoalesce } = input;
	if (isRecovery && rows.some((row) => row.operation === 'delete')) {
		return { kind: 'refuse-recovery-superseded-by-delete' };
	}
	if (canCoalesce && operation === 'delete' && isNeverPushedChain(rows)) {
		return { kind: 'annihilate', chain: rows };
	}

	const pendingRows = rows.filter((row) => row.status === undefined || row.status === 'pending');
	const candidate = pendingRows.at(-1);
	const canUseCandidate = canCoalesce && candidate !== undefined && (candidate.attempts ?? 0) === 0;
	if (
		canUseCandidate &&
		!(isRecovery && operation === 'update') &&
		!(!isRecovery && candidate.requeuedFrom !== undefined)
	) {
		return {
			kind: 'coalesce',
			prior: candidate,
			operation: candidate.operation === 'create' ? 'create' : operation,
		};
	}

	if (isRecovery) {
		return {
			kind: 'append-if-unchanged',
			observedIds: rows
				.filter((row) => row.status !== 'rejected')
				.map((row) => row.mutationId)
				.sort(),
		};
	}

	const createAhead = rows.some(
		(row) =>
			row.operation === 'create' &&
			(row.status === undefined || row.status === 'pending' || row.status === 'claimed')
	);
	return {
		kind: 'append',
		deferBaseRevision: operation === 'delete' && !input.hasBaseRevision && createAhead,
	};
}

export function coalescedPayload(input: {
	operation: WriteOperation;
	residentPayload?: Record<string, unknown>;
	prior: QueuedMutation;
	incomingPayload: Record<string, unknown>;
}): Record<string, unknown> {
	if (input.operation === 'delete') return input.incomingPayload;
	return {
		...(input.residentPayload ?? {}),
		...(input.prior.operation === 'delete' ? {} : input.prior.payload),
		...input.incomingPayload,
	};
}
