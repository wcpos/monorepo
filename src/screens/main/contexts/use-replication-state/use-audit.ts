import * as React from 'react';

import log from '@wcpos/utils/src/logger';

import useRestHttpClient from '../../hooks/use-rest-http-client';

const useAudit = ({ collection }) => {
	const http = useRestHttpClient();
	const [localIDs, setLocalIDs] = React.useState([]);
	const [remoteIDs, setRemoteIDs] = React.useState([]);
	const [initialSyncDone, setInitialSyncDone] = React.useState(false);
	const initialSyncResolver = React.useRef(null);

	/**
	 *
	 */
	const initialSync = new Promise((resolve) => {
		initialSyncResolver.current = resolve;
	});

	const run = React.useCallback(async () => {
		//
		function fetchLocalIDs() {
			return collection
				.find({
					selector: { id: { $exists: true } },
					// fields: ['id'],
				})
				.exec()
				.then((res) => {
					return res.map((doc) => doc.id);
				});
		}

		function fetchRemoteIDs() {
			return http
				.get(collection.name, {
					params: { fields: ['id'], posts_per_page: -1 },
				})
				.then(({ data }) => {
					return data.map((doc) => doc.id);
				});
		}

		try {
			const [localIDs, remoteIDs] = await Promise.all([fetchLocalIDs(), fetchRemoteIDs()]);

			setLocalIDs(localIDs);
			setRemoteIDs(remoteIDs);

			if (!initialSyncDone) {
				setInitialSyncDone(true);
				if (initialSyncResolver.current) {
					initialSyncResolver.current(true);
					initialSyncResolver.current = null;
				}
			}

			return { localIDs, remoteIDs };
		} catch (error) {
			log.error('Error auditing ' + collection.name, error);
			throw error;
		}
	}, [collection, http, initialSyncDone]);

	return { run, initialSync, localIDs, remoteIDs };
};

export default useAudit;

// // compare local and server ids
// const add = data.filter((d) => !find(docs, { id: d.id })).map((d) => ({ ...d, _deleted: false }));

// const remove = docs
// 	.filter((d) => !find(data, { id: d.id }))
// 	.map((d) => ({ ...d, _deleted: true }));
