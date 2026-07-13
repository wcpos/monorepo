import { assertBulkSuccess } from '@wcpos/sync-core';

import {
	COVERAGE_COMPACTION_FAILURE_KEY,
	type CoverageCompactionFailureDocument,
} from './coverage-compaction-failure-schema';

import type { CoverageCompactionFailure } from '../scheduler/coverage-compaction-cadence';

type RxCoverageCompactionFailureDocument<T> = {
	toJSON(withRevAndAttachments?: boolean): unknown;
};

type RxCoverageCompactionFailureCollection<T> = {
	bulkUpsert(items: T[]): Promise<unknown>;
	findOne(documentId: string): { exec(): Promise<RxCoverageCompactionFailureDocument<T> | null> };
};

function toJson<T>(document: RxCoverageCompactionFailureDocument<T> | T): T {
	return document && typeof document === 'object' && 'toJSON' in document
		? (document.toJSON() as T)
		: document;
}

function toDocument(failure: CoverageCompactionFailure | null): CoverageCompactionFailureDocument {
	return {
		stateKey: COVERAGE_COMPACTION_FAILURE_KEY,
		failedAtMs: failure?.failedAtMs ?? null,
		retryAfterMs: failure?.retryAfterMs ?? null,
		schemaVersion: 1,
	};
}

function fromDocument(
	document: CoverageCompactionFailureDocument
): CoverageCompactionFailure | null {
	if (document.failedAtMs === null || document.retryAfterMs === null) return null;
	return { failedAtMs: document.failedAtMs, retryAfterMs: document.retryAfterMs };
}

/** Structural: any database carrying the coverageCompactionFailures collection (LabDatabase and engine scope dbs both satisfy it). */
export type CoverageCompactionFailureDatabase = {
	coverageCompactionFailures: RxCoverageCompactionFailureCollection<CoverageCompactionFailureDocument>;
};

export class RxCoverageCompactionFailureRepository {
	private readonly coverageCompactionFailures: RxCoverageCompactionFailureCollection<CoverageCompactionFailureDocument>;

	constructor(db: CoverageCompactionFailureDatabase) {
		this.coverageCompactionFailures = db.coverageCompactionFailures;
	}

	async readFailure(): Promise<CoverageCompactionFailure | null> {
		const document = await this.coverageCompactionFailures
			.findOne(COVERAGE_COMPACTION_FAILURE_KEY)
			.exec();
		return document ? fromDocument(toJson<CoverageCompactionFailureDocument>(document)) : null;
	}

	async recordFailure(failure: CoverageCompactionFailure): Promise<void> {
		assertBulkSuccess(
			await this.coverageCompactionFailures.bulkUpsert([toDocument(failure)]),
			'rx-coverage-compaction-failure-repository upsert'
		);
	}

	async clearFailure(): Promise<void> {
		assertBulkSuccess(
			await this.coverageCompactionFailures.bulkUpsert([toDocument(null)]),
			'rx-coverage-compaction-failure-repository upsert'
		);
	}
}
