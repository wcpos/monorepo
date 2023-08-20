import * as React from 'react';

import { useObservable } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { of } from 'rxjs';
import { catchError, tap, filter, switchMap } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import useCollection, { CollectionKey } from './use-collection';
import usePullDocument from '../contexts/use-pull-document';

/**
 *
 */
export const useGetDocumentByRemoteId$ = (
	collectionName: CollectionKey,
	remoteID: number,
	apiEndpoint?: string,
	fallback?: any
) => {
	const pullDocument = usePullDocument();
	const { collection } = useCollection(collectionName);

	return React.useMemo(() => {
		return collection.findOne({ selector: { id: remoteID } }).$.pipe(
			switchMap((doc) => {
				if (!isRxDocument(doc)) {
					return pullDocument(remoteID, collection, apiEndpoint);
				}
				return of(doc);
			}),
			filter((doc) => isRxDocument(doc)),
			catchError((error) => {
				return of(fallback);
			})
		);
	}, [apiEndpoint, collection, remoteID, fallback, pullDocument]);
};
