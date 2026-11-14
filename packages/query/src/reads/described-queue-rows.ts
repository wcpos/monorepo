import { from, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { discardConsequence, type QueueRow, type RxdbSyncEngine } from '@wcpos/sync-engine';
import { getLogger } from '@wcpos/utils/logger';

import { observeEngineDatabases } from '../engine-query';
import { WRITEABLE_REMOTE_ID_FIELD } from '../engine-adapter/collection-map';
import { engineCollection } from '../records/engine-collection';
import { observeQueueRows, type QueueSelection } from './queue-rows';

import type { EngineRecordCollectionName } from '../records/engine-record';

export type DescribedQueueRow = QueueRow & {
	resident: Record<string, unknown> | null;
	residentRead: 'ok' | 'missing' | 'failed';
	discard: ReturnType<typeof discardConsequence>;
};
const logger = getLogger(['wcpos', 'query', 'queue']);

export function observeDescribedQueueRows(engine: RxdbSyncEngine, selection?: QueueSelection) {
	return observeEngineDatabases(engine).pipe(
		switchMap((database) =>
			!database
				? of<DescribedQueueRow[]>([])
				: observeQueueRows(engine, selection).pipe(
						switchMap((rows) =>
							from(
								Promise.all(
									rows.map(async (row): Promise<DescribedQueueRow> => {
										let resident: Record<string, unknown> | null = null;
										let residentRead: DescribedQueueRow['residentRead'] = 'missing';
										try {
											const doc = await engineCollection(
												database,
												row.collectionName as EngineRecordCollectionName
											)
												?.findOne(row.recordId)
												.exec();
											resident = doc?.toJSON() ?? null;
											if (resident) residentRead = 'ok';
										} catch (error) {
											residentRead = 'failed';
											// Debug: a display-only fallback with no merchant consequence.
											logger.debug('Queue description could not read the local record', {
												context: {
													collection: row.collectionName,
													recordId: row.recordId,
													error: String(error),
												},
											});
										}
										return {
											...row,
											resident,
											residentRead,
											discard: discardConsequence({
												row,
												resident: residentRead === 'failed' ? 'read-failed' : resident,
												remoteIdField:
													WRITEABLE_REMOTE_ID_FIELD[
														row.collectionName as keyof typeof WRITEABLE_REMOTE_ID_FIELD
													],
											}),
										};
									})
								)
							)
						)
					)
		)
	);
}
