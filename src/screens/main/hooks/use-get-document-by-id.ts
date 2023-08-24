import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { of, lastValueFrom } from 'rxjs';
import { catchError, tap, filter, switchMap } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import useCollection, { CollectionKey } from './use-collection';
import usePullDocument from '../contexts/use-pull-document';

interface Props {
	collectionName: CollectionKey;
	remoteID: number;
	apiEndpoint?: string;
	fallback?: any;
}

/**
 * TODO - this seems messy, there must be a better way
 */
export const useGetDocumentByRemoteId = ({
	collectionName,
	remoteID,
	apiEndpoint,
	fallback,
}: Props) => {
	const pullDocument = usePullDocument();
	const { collection } = useCollection(collectionName);

	/**
	 * NOTE: document$ will emit on change to collection
	 * use Promise if document should not change after initial load
	 *
	 * TODO: add timeout with error message, for offline case
	 */
	const document$ = React.useMemo(() => {
		// special case for default customer = guest customer
		if (remoteID === 0) {
			return of(fallback);
		}
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

	const documentResource = React.useMemo(() => new ObservableResource(document$), [document$]);
	const documentPromise = lastValueFrom(document$);

	return { document$, documentResource, documentPromise };
};
