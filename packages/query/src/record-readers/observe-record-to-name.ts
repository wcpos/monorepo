import { EMPTY, merge, Observable } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { remoteIdOrNull } from '@wcpos/sync-core';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { COLLECTION_VOCABULARY, resolveLegacyField } from '../engine-adapter/collection-map';
import { observeEngineDatabases } from '../engine-query';
import { engineCollection } from '../records/engine-collection';

import type { EngineRecordCollectionName } from '../records/engine-record';

/**
 * One emission of {@link observeRecordToName}: `rebound` when the collection was
 * (re)bound — the caller drops its previous answer, because store ids overlap
 * across stores — else the record as plain JSON, or `null` when this device does
 * not hold it.
 */
export type RecordToNameEmission =
	{ type: 'rebound' } | { type: 'record'; record: Record<string, unknown> | null };

/**
 * Observe the one record a diagnostics row is about, to NAME it (Logs ledger,
 * expanded log row, Database attention panel). Never suspends — the name is
 * decoration on top of a log-derived row.
 *
 * Push-side rows carry the local uuid; pull-side repair rows (`apply.escalation`,
 * SYNC331) carry the store's numeric id. Every collection, pull-only ones included
 * (a tax-rate range checksum), keeps that id in the column the registry maps `id`
 * to, not the primary key.
 *
 * Re-reads on every database the engine opens: a row mounted on cold start, before
 * the scope is open, must still get its name once it is. Clear & re-download
 * replaces the collection IN the same database, so `db$` stays quiet and the old
 * collection's query goes dead; the engine's `collection-reset` event is the signal
 * to observe the replacement, which then reports the record as the refill lands.
 *
 * A failed read goes to `onReadError` and ends only that read, never the stream, so
 * the next database the engine opens still gets one.
 */
export function observeRecordToName(
	engine: RxdbSyncEngine,
	collectionName: EngineRecordCollectionName,
	recordId: string,
	onReadError: (error: unknown) => void
): Observable<RecordToNameEmission> {
	const remoteId = remoteIdOrNull(recordId);
	const query =
		remoteId !== null
			? {
					selector: {
						[resolveLegacyField(COLLECTION_VOCABULARY[collectionName].legacyName, 'id').enginePath]:
							remoteId,
					},
				}
			: recordId;
	const replaced$ = new Observable<void>((subscriber) =>
		engine.events((event) => {
			if (event.type === 'collection-reset' && event.collection === collectionName) {
				subscriber.next();
			}
		})
	).pipe(map(() => engine.active()?.database ?? null));

	return merge(observeEngineDatabases(engine), replaced$).pipe(
		switchMap((database) => {
			const records = engineCollection(database, collectionName);
			const rebound = new Observable<RecordToNameEmission>((subscriber) => {
				subscriber.next({ type: 'rebound' });
				subscriber.complete();
			});
			if (!records) return rebound;
			return merge(
				rebound,
				records.findOne(query).$.pipe(
					map((doc): RecordToNameEmission => {
						const json = doc
							? ((typeof (doc as { toJSON?: unknown }).toJSON === 'function'
									? (doc as { toJSON(): unknown }).toJSON()
									: doc) as Record<string, unknown>)
							: null;
						return { type: 'record', record: json };
					}),
					catchError((error: unknown) => {
						onReadError(error);
						return EMPTY;
					})
				)
			);
		})
	);
}
