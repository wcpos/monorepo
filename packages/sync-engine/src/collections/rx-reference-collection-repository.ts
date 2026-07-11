import { assertBulkSuccess } from '@wcpos/sync-core';

/**
 * RxDB-backed repository for the greedy reference collections (categories,
 * brands). Adds set-difference DELETION on top of the upsert: the greedy refresh
 * fetches the COMPLETE authoritative set, so a server-sourced local doc absent
 * from it was deleted upstream and must be tombstoned (the refresh only upserts,
 * never prunes). Kept separate from the RxDB-agnostic reference *fetcher* so the
 * fetcher stays storage-free and this concrete wiring can be integration-tested
 * against a real RxDB collection.
 */
import type { LocalReferenceDocument } from './reference-collection-schema';

export type ReferenceRxCollection = {
	bulkUpsert(documents: LocalReferenceDocument[]): Promise<unknown>;
	bulkRemove(ids: string[]): Promise<unknown>;
	find(): { exec(): Promise<{ toJSON(): LocalReferenceDocument }[]> };
};

export type ReferenceCollectionRepository = {
	upsertMany(documents: LocalReferenceDocument[]): Promise<void>;
	/**
	 * Remove SERVER-SOURCED local docs absent from the authoritative complete set
	 * (deleted upstream). Locally-born docs (source !== 'woo-rest') are never
	 * pruned — they're legitimately absent from the server set until pushed.
	 * Returns the ids removed.
	 */
	pruneServerSourcedAbsent(keptDocumentIds: readonly string[]): Promise<string[]>;
};

export function referenceCollectionRepository(
	collection: ReferenceRxCollection
): ReferenceCollectionRepository {
	return {
		async upsertMany(documents: LocalReferenceDocument[]): Promise<void> {
			assertBulkSuccess(
				await collection.bulkUpsert(documents),
				'rx-reference-collection-repository upsert'
			);
		},
		async pruneServerSourcedAbsent(keptDocumentIds: readonly string[]): Promise<string[]> {
			const kept = new Set(keptDocumentIds);
			const docs = await collection.find().exec();
			const toRemove = docs
				.map((doc) => doc.toJSON())
				.filter((doc) => doc.sync?.source === 'woo-rest' && !kept.has(doc.id))
				.map((doc) => doc.id);
			if (toRemove.length > 0)
				assertBulkSuccess(
					await collection.bulkRemove(toRemove),
					'rx-reference-collection-repository remove'
				);
			return toRemove;
		},
	};
}
