import * as React from 'react';

import { timer } from 'rxjs';

import log from '@wcpos/utils/src/logger';

import useRestHttpClient from '../../hooks/use-rest-http-client';

const runningAudits = new Map();

/**
 *
 */
const useAudit = ({ collection, endpoint, auditTime = 600000 }) => {
	const http = useRestHttpClient();

	/**
	 *
	 */
	const run = React.useCallback(async () => {
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
			collection.upsertLocal('remote-' + endpoint, {
				remoteIDs,
			});

			return remoteIDs;
		} catch (error) {
			log.error(`Error auditing ${collection.name}:`, error);
		}
	}, [collection, endpoint, http]);

	/**
	 * Set up a timer to run every 10 minutes (600000 ms)
	 */
	React.useEffect(() => {
		if (!runningAudits.has(endpoint)) {
			run();

			const auditTimer = timer(auditTime, auditTime).subscribe(() => {
				run();
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
	}, [auditTime, endpoint, run]);

	return { run };
};

export default useAudit;

// // compare local and server ids
// const add = data.filter((d) => !find(docs, { id: d.id })).map((d) => ({ ...d, _deleted: false }));

// const remove = docs
//  .filter((d) => !find(data, { id: d.id }))
//  .map((d) => ({ ...d, _deleted: true }));
