import * as React from 'react';

import isEmpty from 'lodash/isEmpty';
import { timer } from 'rxjs';

import log from '@wcpos/utils/src/logger';

import { getlocalDocsWithIDs } from './audit.helpers';
import useRestHttpClient from '../../hooks/use-rest-http-client';

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
	const http = useRestHttpClient();
	// Create a ref to store the ongoing fetchRemoteIDs promise
	const fetchRemoteIDsPromiseRef = React.useRef(null);

	/**
	 * Fetch remote IDs
	 */
	const fetchRemoteIDs = React.useCallback(async () => {
		// If there's an ongoing fetchRemoteIDs promise, return it
		if (fetchRemoteIDsPromiseRef.current) {
			return fetchRemoteIDsPromiseRef.current;
		}

		// Create a new fetchRemoteIDs promise and store it in the ref
		fetchRemoteIDsPromiseRef.current = (async () => {
			try {
				// Get array of all remote IDs
				const remoteIDs = await http
					.get(endpoint, {
						params: { fields: ['id'], posts_per_page: -1 },
					})
					.then(({ data }) => {
						return data.map((doc) => doc.id);
					});

				// Save to local storage
				collection.upsertLocal('audit-' + endpoint, {
					remoteIDs,
				});

				return remoteIDs;
			} catch (error) {
				log.error(`Error auditing ${collection.name}:`, error);
			} finally {
				// Clear the ref when the promise is resolved or rejected
				fetchRemoteIDsPromiseRef.current = null;
			}
		})();

		return fetchRemoteIDsPromiseRef.current;
	}, [collection, endpoint, http]);

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
				if (isEmpty(remoteIDs) || force) {
					remoteIDs = await fetchRemoteIDs();
				}

				const localDocsWithID = await getlocalDocsWithIDs(collection, endpoint);

				// compare local and server ids
				const localIDs = localDocsWithID.map((doc) => doc.id);
				const include = remoteIDs.filter((id) => !localIDs.includes(id));
				const remove = localDocsWithID
					.filter((obj) => !remoteIDs.includes(obj.id))
					.map((obj) => ({ uuid: obj.uuid, _deleted: true }));
				const exclude = localIDs;
				const completeIntitalSync = include.length === 0;
				const lastModified =
					localDocsWithID.length > 0 ? localDocsWithID[0].date_modified_gmt : null;

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
		[collection, endpoint, fetchRemoteIDs]
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

// // compare local and server ids
// const add = data.filter((d) => !find(docs, { id: d.id })).map((d) => ({ ...d, _deleted: false }));

// const remove = docs
//  .filter((d) => !find(data, { id: d.id }))
//  .map((d) => ({ ...d, _deleted: true }));
