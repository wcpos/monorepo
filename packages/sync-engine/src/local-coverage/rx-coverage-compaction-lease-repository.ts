import {
	COVERAGE_COMPACTION_LEASE_KEY,
	type CoverageCompactionLeaseDocument,
} from './coverage-compaction-lease-schema';

import type { CoverageCompactionLease } from '../scheduler/coverage-compaction-cadence';

type RxCoverageCompactionLeaseDocument<T> = {
	toJSON(withRevAndAttachments?: boolean): unknown;
	incrementalModify?(
		mutationFunction: (
			document: T & { _deleted?: boolean }
		) => T | (T & { _deleted?: boolean }) | Promise<T | (T & { _deleted?: boolean })>
	): Promise<unknown>;
};

type RxCoverageCompactionLeaseCollection<T> = {
	insert(item: T): Promise<unknown>;
	findOne(documentId: string): {
		exec(includeDeleted?: boolean): Promise<RxCoverageCompactionLeaseDocument<T> | null>;
	};
};

function toJson<T>(document: RxCoverageCompactionLeaseDocument<T> | T): T {
	return document && typeof document === 'object' && 'toJSON' in document
		? (document.toJSON() as T)
		: document;
}

function toLease(document: CoverageCompactionLeaseDocument): CoverageCompactionLease {
	const { leaseKey: _leaseKey, schemaVersion: _schemaVersion, ...lease } = document;
	return lease;
}

function toDocument(lease: CoverageCompactionLease): CoverageCompactionLeaseDocument {
	return { leaseKey: COVERAGE_COMPACTION_LEASE_KEY, ...lease, schemaVersion: 1 };
}

function sameLease(left: CoverageCompactionLease, right: CoverageCompactionLease): boolean {
	return (
		left.ownerId === right.ownerId &&
		left.acquiredAtMs === right.acquiredAtMs &&
		left.expiresAtMs === right.expiresAtMs
	);
}

function isDeletedDocument<T>(document: T & { _deleted?: boolean }): boolean {
	return document._deleted === true;
}

function isRxConflict(error: unknown): boolean {
	return Boolean(
		error && typeof error === 'object' && 'code' in error && error.code === 'CONFLICT'
	);
}

/** Structural: any database carrying the coverageCompactionLeases collection (LabDatabase and engine scope dbs both satisfy it). */
export type CoverageCompactionLeaseDatabase = {
	coverageCompactionLeases: RxCoverageCompactionLeaseCollection<CoverageCompactionLeaseDocument>;
};

export class RxCoverageCompactionLeaseRepository {
	private readonly coverageCompactionLeases: RxCoverageCompactionLeaseCollection<CoverageCompactionLeaseDocument>;

	constructor(db: CoverageCompactionLeaseDatabase) {
		this.coverageCompactionLeases = db.coverageCompactionLeases;
	}

	async readLease(): Promise<CoverageCompactionLease | null> {
		const document = await this.coverageCompactionLeases
			.findOne(COVERAGE_COMPACTION_LEASE_KEY)
			.exec();
		return document ? toLease(toJson<CoverageCompactionLeaseDocument>(document)) : null;
	}

	async claimLease(
		lease: CoverageCompactionLease,
		expectedLease: CoverageCompactionLease | null
	): Promise<CoverageCompactionLease | null> {
		const nextDocument = toDocument(lease);
		if (expectedLease === null) {
			try {
				await this.coverageCompactionLeases.insert(nextDocument);
				return lease;
			} catch (error: unknown) {
				if (!isRxConflict(error)) throw error;
				const conflictDocument = await this.coverageCompactionLeases
					.findOne(COVERAGE_COMPACTION_LEASE_KEY)
					.exec(true);
				if (!conflictDocument?.incrementalModify) return null;

				let claimedDeletedTombstone = false;
				await conflictDocument.incrementalModify((currentDocument) => {
					claimedDeletedTombstone = isDeletedDocument(currentDocument);
					return claimedDeletedTombstone ? { ...nextDocument, _deleted: false } : currentDocument;
				});

				return claimedDeletedTombstone ? lease : null;
			}
		}

		const document = await this.coverageCompactionLeases
			.findOne(COVERAGE_COMPACTION_LEASE_KEY)
			.exec();
		if (!document?.incrementalModify) return null;

		let claimed = false;
		await document.incrementalModify((currentDocument) => {
			const currentLease = toLease(currentDocument);
			claimed = sameLease(currentLease, expectedLease);
			return claimed ? nextDocument : currentDocument;
		});

		return claimed ? lease : null;
	}

	async releaseLease(ownerId: string): Promise<void> {
		const document = await this.coverageCompactionLeases
			.findOne(COVERAGE_COMPACTION_LEASE_KEY)
			.exec();
		if (!document?.incrementalModify) return;

		await document.incrementalModify((currentDocument) =>
			currentDocument.ownerId === ownerId ? { ...currentDocument, expiresAtMs: 0 } : currentDocument
		);
	}
}
