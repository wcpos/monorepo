import { assertBulkSuccess, wooIdOf } from '@wcpos/sync-core';

/**
 * RxDB-backed repository for the greedy reference collections (categories,
 * brands). Adds set-difference DELETION on top of the upsert: the greedy refresh
 * fetches the COMPLETE authoritative set, so a server-sourced local doc absent
 * from it was deleted upstream and must be tombstoned (the refresh only upserts,
 * never prunes). Kept separate from the RxDB-agnostic reference *fetcher* so the
 * fetcher stays storage-free and this concrete wiring can be integration-tested
 * against a real RxDB collection.
 */
import { hasPendingLocalWork, withoutLocallyProtected } from '../write-path/local-work-guard';

import type { LocalReferenceDocument } from './reference-collection-schema';

export type ReferenceRxCollection = {
	bulkUpsert(documents: LocalReferenceDocument[]): Promise<unknown>;
	bulkRemove(ids: string[]): Promise<unknown>;
	findByIds(ids: string[]): {
		exec(): Promise<Map<string, { toJSON(): unknown }>>;
	};
	find(): { exec(): Promise<{ toJSON(): LocalReferenceDocument }[]> };
};

export type ReferenceCollectionRepository = {
	upsertMany(documents: LocalReferenceDocument[]): Promise<void>;
	listServerSourcedAbsent(
		keptDocumentIds: readonly string[]
	): Promise<{ uuid: string; wooId: number }[]>;
	pruneServerSourcedAbsentByUuids(uuids: readonly string[]): Promise<string[]>;
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
	const canPrune = (doc: LocalReferenceDocument): boolean =>
		doc.sync?.source === 'woo-rest' && !hasPendingLocalWork(doc);
	const remove = async (uuids: string[]): Promise<string[]> => {
		if (uuids.length > 0)
			assertBulkSuccess(
				await collection.bulkRemove(uuids),
				'rx-reference-collection-repository remove'
			);
		return uuids;
	};
	return {
		async upsertMany(documents: LocalReferenceDocument[]): Promise<void> {
			const applicable = await withoutLocallyProtected(collection, documents);
			if (applicable.length > 0)
				assertBulkSuccess(
					await collection.bulkUpsert(applicable),
					'rx-reference-collection-repository upsert'
				);
		},
		async listServerSourcedAbsent(keptDocumentIds) {
			const kept = new Set(keptDocumentIds);
			return (await collection.find().exec())
				.map((doc) => doc.toJSON())
				.filter(
					(
						doc
					): doc is LocalReferenceDocument & {
						remoteId: NonNullable<LocalReferenceDocument['remoteId']>;
					} => canPrune(doc) && doc.remoteId !== null && !kept.has(doc.uuid)
				)
				.map((doc) => ({ uuid: doc.uuid, wooId: wooIdOf(doc.remoteId) }));
		},
		async pruneServerSourcedAbsentByUuids(uuids) {
			if (uuids.length === 0) return [];
			const requested = new Set(uuids);
			const docs = await collection.findByIds([...requested]).exec();
			return remove(
				[...docs.values()]
					.map((doc) => doc.toJSON() as LocalReferenceDocument)
					.filter((doc) => requested.has(doc.uuid) && canPrune(doc))
					.map((doc) => doc.uuid)
			);
		},
		async pruneServerSourcedAbsent(keptDocumentIds: readonly string[]): Promise<string[]> {
			const kept = new Set(keptDocumentIds);
			const docs = await collection.find().exec();
			const toRemove = docs
				.map((doc) => doc.toJSON())
				.filter((doc) => canPrune(doc) && !kept.has(doc.uuid))
				.map((doc) => doc.uuid);
			return remove(toRemove);
		},
	};
}
