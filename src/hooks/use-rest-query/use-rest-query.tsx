import * as React from 'react';
import { useObservable, useSubscription } from 'observable-hooks';
import { withLatestFrom } from 'rxjs';
import { tap } from 'rxjs/operators';
import { replicateRxCollection } from 'rxdb/plugins/replication';
import http from 'axios';
import { useNavigation } from '@react-navigation/native';
import useAppState from '../use-app-state';
import useQuery from '../use-query';

export const useRestQuery = (collectionName: 'products' | 'orders' | 'customers', options = {}) => {
	const { storeDB, site, wpCredentials } = useAppState();
	const collection = storeDB.collections[collectionName];
	const { query } = useQuery();
	const navigation = useNavigation();

	const restQuery$ = useObservable(
		(query$) =>
			query$.pipe(
				// @ts-ignore
				withLatestFrom(collection.unsyncedDocuments$),
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
								console.log(latestPullDocument);

								const headers = {
									'X-WCPOS': '1',
								};
								if (wpCredentials.wpNonce) {
									Object.assign(headers, { 'X-WP-Nonce': wpCredentials.wpNonce });
								}
								if (wpCredentials.jwt) {
									Object.assign(headers, { Authorization: `Bearer ${wpCredentials.jwt}` });
								}

								const result = await http
									// @ts-ignore
									.get('products', {
										baseURL: site.wcApiUrl,
										params: {
											per_page: 10,
											page: 1,
											order: 'asc',
											orderby: 'title',
										},
										headers,
									})
									.catch(({ response }) => {
										console.log(response);
										if (!response) {
											console.error('CORS error');
											return;
										}
										if (response.status === 401) {
											// @ts-ignore
											navigation.navigate('Modal', { login: true });
										}
										if (response.status === 403) {
											console.error('invalid nonce');
										}
									});

								console.log(result);
								// need to add localId to each product
								const data = result?.data || [];
								const promises = data.map(async (product: any) => {
									const existing = await collection.findOne().where('id').eq(product.id).exec();
									if (existing) {
										Object.assign(product, { localID: existing.localID });
									}
									delete product._links;
									return product;
								});

								const documents = await Promise.all(promises);
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
