// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { RxCoverageCompactionFailureRepository } from './rx-coverage-compaction-failure-repository';

import type { CoverageCompactionFailure } from '../scheduler/coverage-compaction-cadence';

type FailureDocument = {
	stateKey: string;
	failedAtMs: number | null;
	retryAfterMs: number | null;
	schemaVersion?: 1;
};

function createCollection(initial?: FailureDocument) {
	let stored: FailureDocument | null = initial ? { ...initial } : null;
	const bulkUpsert = vi.fn(async (items: FailureDocument[]) => {
		stored = { ...items[0] };
	});
	const findOne = vi.fn((_documentId: string) => ({
		exec: vi.fn(async () => (stored ? { toJSON: () => ({ ...stored }) } : null)),
	}));
	return {
		collection: { bulkUpsert, findOne },
		get stored() {
			return stored;
		},
		bulkUpsert,
		findOne,
	};
}

function repositoryFor(initial?: FailureDocument) {
	const fixture = createCollection(initial);
	const repository = new RxCoverageCompactionFailureRepository({
		coverageCompactionFailures: fixture.collection,
	} as never);
	return { repository, fixture };
}

describe('RxCoverageCompactionFailureRepository', () => {
	it('reads no failure when the singleton state is absent or cleared', async () => {
		const { repository } = repositoryFor();

		await expect(repository.readFailure()).resolves.toBeNull();

		const cleared = repositoryFor({
			stateKey: 'coverage-compaction',
			failedAtMs: null,
			retryAfterMs: null,
		});
		await expect(cleared.repository.readFailure()).resolves.toBeNull();
	});

	it('records the singleton failure backoff state', async () => {
		const { repository, fixture } = repositoryFor();
		const failure: CoverageCompactionFailure = { failedAtMs: 1_500, retryAfterMs: 301_500 };

		await repository.recordFailure(failure);

		expect(fixture.bulkUpsert).toHaveBeenCalledWith([
			{ stateKey: 'coverage-compaction', ...failure, schemaVersion: 1 },
		]);
		await expect(repository.readFailure()).resolves.toEqual(failure);
	});

	it('clears the singleton failure state without deleting the document', async () => {
		const { repository, fixture } = repositoryFor({
			stateKey: 'coverage-compaction',
			failedAtMs: 1_500,
			retryAfterMs: 301_500,
		});

		await repository.clearFailure();

		expect(fixture.stored).toEqual({
			stateKey: 'coverage-compaction',
			failedAtMs: null,
			retryAfterMs: null,
			schemaVersion: 1,
		});
		await expect(repository.readFailure()).resolves.toBeNull();
	});
});
