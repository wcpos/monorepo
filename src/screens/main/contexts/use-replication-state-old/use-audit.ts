import * as React from 'react';

import { timer } from 'rxjs';

import log from '@wcpos/utils/src/logger';

import {
	getlocalDocsWithIDsOrderedByLastModified,
	getAndPatchRecentlyModified,
} from './audit.helpers';
import { getPriority } from './replication.helpers';
import useQueuedRestRequest from '../../hooks/use-queued-rest-request';

const runningAudits = new Map();

/**
 *
 */
interface AuditRunOptions {
	force?: boolean;
}

/**
 *
 */
export interface AuditStatus {
	include: number[];
	remove: { uuid: string; _deleted: boolean }[];
	exclude: number[];
	completeIntitalSync: boolean;
	lastModified: string;
}

/**
 *
 */
const useAudit = ({ collection, endpoint, auditTime = 600000 }) => {
	const queuedHttp = useQueuedRestRequest();

	/**
	 * Fetch remote IDs
	 */
	const fetchRemoteIDs = React.useCallback(async () => {
		try {
			// Get array of all remote IDs
			const remoteIDs = await queuedHttp
				.get(
					endpoint,
					{
						params: { fields: ['id'], posts_per_page: -1 },
					},
					getPriority(endpoint),
					endpoint + '-audit'
				)
				.then(({ data }) => {
					return data.map((doc) => doc.id);
				});

			// Save to local storage
			collection.upsertLocal('audit-' + endpoint, {
				remoteIDs,
				lastAudit: new Date().toISOString(),
			});

			return remoteIDs;
		} catch (error) {
			log.error(`Error auditing ${collection.name}:`, error);
		}
	}, [collection, endpoint, queuedHttp]);

	/**
	 * Perform the audit
	 */
	const run = React.useCallback(
		async (options?: AuditRunOptions): Promise<AuditStatus> => {
			const { force = false } = options ?? {};
			try {
				// needs to be endoint specific for variations
				const remote = await collection
					.getLocal('audit-' + endpoint)
					.then((doc) => doc?.toJSON().data || {});

				let remoteIDs = remote.remoteIDs;

				// get lastModified from local, we need that for the audit
				const localDocsWithID = await getlocalDocsWithIDsOrderedByLastModified(
					collection,
					endpoint
				);
				const lastModified =
					localDocsWithID.length > 0 ? localDocsWithID[0].date_modified_gmt : null;

				/**
				 * remoteIDs will be undefined for first sync, so we need to fetch them.
				 * we also need to periodically update the remoteIDs in case new docs are added/removed
				 */
				if (!remoteIDs || force) {
					remoteIDs = await fetchRemoteIDs();

					/**
					 * FIXME: this is a bit of a hack. If a collection is not synced, we will not get updates from
					 * the server in a timely manner. eg: say you 100,000 orders. You will never get updates because the
					 * old orders are being synced and the lastModified is not used.
					 *
					 * So, if there is a lastModified, we do a cheeky fetch here. This also gets around an issue I'm having
					 * with rxdb silently dropping changes in the pull replication.
					 *
					 * UPDATE: to reduce network requests I'm adding the date_modified_gmt to the remoteIDs
					 * so now we only fetch the items if needed.
					 */
					if (lastModified) {
						// check removeIDs for any docs that have been updated since lastModified
						const lastModifiedDate = new Date(lastModified);
						const recentlyModifiedIDs = remoteIDs.filter((obj) => {
							if (obj.date_modified_gmt === undefined) {
								// we will not get updated docs if we don't have a date_modified_gmt
								return false;
							}
							const objDate = new Date(obj.date_modified_gmt);
							return objDate > lastModifiedDate;
						});
						if (recentlyModifiedIDs.length > 0) {
							await getAndPatchRecentlyModified(lastModified, collection, endpoint, queuedHttp);
						}
					}
				}

				// compare local and server ids
				const localIDs = localDocsWithID.map((doc) => doc.id);
				const include = remoteIDs.filter((id) => !localIDs.includes(id));
				const remove = localDocsWithID
					.filter((obj) => !remoteIDs.includes(obj.id))
					.map((obj) => ({ uuid: obj.uuid, _deleted: true }));
				const exclude = localIDs;
				const completeIntitalSync = include.length === 0;

				// if (!completeIntitalSync && lastModified) {
				// 	await getAndPatchRecentlyModified(lastModified, collection, endpoint, queuedHttp);
				// }

				return {
					include,
					remove,
					exclude,
					completeIntitalSync,
					lastModified,
					remoteIDs,
				};
			} catch (error) {
				log.error(`Error auditing ${collection.name}:`, error);
			}
		},
		[collection, endpoint, fetchRemoteIDs, queuedHttp]
	);

	/**
	 * Set up a timer to run every 10 minutes (600000 ms)
	 */
	React.useEffect(() => {
		if (!runningAudits.has(endpoint)) {
			run({ force: true }); // do full sync on the first run

			const auditTimer = timer(auditTime, auditTime).subscribe(() => {
				fetchRemoteIDs();
			});

			runningAudits.set(endpoint, auditTimer);
		}

		return () => {
			const auditTimer = runningAudits.get(endpoint);
			if (auditTimer) {
				auditTimer.unsubscribe();
				runningAudits.delete(endpoint);
			}
		};
	}, [auditTime, endpoint, fetchRemoteIDs, run]);

	return { run };
};

export default useAudit;
