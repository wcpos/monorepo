import * as React from 'react';

import { ObservableResource, useObservable } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { of, lastValueFrom } from 'rxjs';
import { catchError, tap, filter, switchMap, timeout } from 'rxjs/operators';

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
 *
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
	 * TODO - this will hang the app if there is no internet connection or a problem with the server
	 * I need to figure out how to handle this better
	 */
	const document$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(([col, id, fb, pd]) => {
					// if no id, return fallback/undefined
					if (!id) {
						return of(fb);
					}
					return col.findOne({ selector: { id } }).$.pipe(
						tap((doc) => {
							if (!isRxDocument(doc)) {
								pd(remoteID, collection, apiEndpoint);
							}
						}),
						filter((doc) => isRxDocument(doc)),
						catchError((error) => {
							log.error(error);
							return of(fb);
						})
					);
				})
			),
		[collection, remoteID, fallback, pullDocument]
	);

	const documentResource = React.useMemo(() => new ObservableResource(document$), [document$]);
	const documentPromise = lastValueFrom(document$);

	return { document$, documentResource, documentPromise };
};
