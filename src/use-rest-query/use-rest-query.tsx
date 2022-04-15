import * as React from 'react';
import { useObservable, useSubscription } from 'observable-hooks';
import { withLatestFrom } from 'rxjs';
import { tap } from 'rxjs/operators';
import { replicateRxCollection } from 'rxdb/plugins/replication';
import http from '@wcpos/common/src/lib/http';
import get from 'lodash/get';
import set from 'lodash/set';
import useQuery from '../use-query';
import useAppState from '../use-app-state';

export const useRestQuery = (collectionName: 'products' | 'orders' | 'customers', options = {}) => {
	const { storeDB } = useAppState();
	const collection = storeDB.collections[collectionName];
	const { query } = useQuery();

	const restQuery$ = useObservable(
		(query$) =>
			query$.pipe(
				withLatestFrom(collection.unsyncedIds$),
				tap(async ([[q], unsyncedDocuments]) => {
					const replicationState = await replicateRxCollection({
						// @ts-ignore
						collection,
						replicationIdentifier: 'product-replication',
						/**
						 * By default it will do a one-time replication.
						 * By settings live: true the replication will continuously
						 * replicate all changes.
						 * (optional), default is false.
						 */
						// live: true,
						/**
						 * Interval in milliseconds on when to run the next replication cycle.
						 * Set this to 0 when you have a back-channel from your remote
						 * that that tells the client when to fetch remote changes.
						 * (optional), only needed when live=true, default is 10 seconds.
						 */
						// liveInterval: 10000,
						/**
						 * Time in milliseconds after when a failed replication cycle
						 * has to be retried.
						 * (optional), default is 5 seconds.
						 */
						// retryTime: number,
						/**
						 * Optional,
						 * only needed when you want to replicate remote changes to the local state.
						 */
						pull: {
							/**
							 * Pull handler
							 */
							// @ts-ignore
							async handler(latestPullDocument) {
								// console.log(latestPullDocument);
								// console.log(q);

								const params = {
									per_page: 10,
									page: 1,
									order: q.sortDirection,
									orderby: q.sortBy === 'name' ? 'title' : q.sortBy,
								};

								if (get(q, 'filters.category.id')) {
									set(params, 'category', get(q, 'filters.category.id'));
								}
								if (get(q, 'filters.tag.id')) {
									set(params, 'tag', get(q, 'filters.tag.id'));
								}

								debugger;
								const result = await http.get('products', {
									params,
								});

								// console.log(result);
								const documents = result?.data || [];
								// why is data not being put through parseRestResponse?
								// const documents = data.map((item) => collection.parseRestResponse(item));
								// debugger;

								// const limitPerPull = 10;
								// const minTimestamp = latestPullDocument ? latestPullDocument.updatedAt : 0;
								// /**
								//  * In this example we replicate with a remote REST server
								//  */
								// const documentsFromRemote = fetch(
								// 	`https://example.com/api/sync/?minUpdatedAt=${minTimestamp}&limit=${limitPerPull}`
								// ).json();

								return {
									/**
									 * Contains the pulled documents from the remote.
									 */
									documents,
									/**
									 * Must be true if there might be more newer changes on the remote.
									 */
									hasMoreDocuments: false,
								};
							},
						},
						/**
						 * Optional,
						 * only needed when you want to replicate local changes to the remote instance.
						 */
						// push: {
						// 	/**
						// 	 * Push handler
						// 	 */
						// 	async handler(docs) {
						// 		/**
						// 		 * Push the local documents to a remote REST server.
						// 		 */
						// 		await postData('https://example.com/api/sync/push', { docs });
						// 	},
						// 	/**
						// 	 * Batch size, optional
						// 	 * Defines how many documents will be given to the push handler at once.
						// 	 */
						// 	batchSize: 5,
						// },
					});
				})
			),
		[query]
	);

	const subscription = useSubscription(restQuery$);
};
