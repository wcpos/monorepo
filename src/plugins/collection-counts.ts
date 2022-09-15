import { BehaviorSubject } from 'rxjs';
import { debounceTime, shareReplay, tap } from 'rxjs/operators';

type RxPlugin = import('rxdb/dist/types').RxPlugin;
type RxCollection = import('rxdb/dist/types').RxCollection;

// const usersCollections = ['logs', 'users', 'sites', 'wp_credentials', 'stores'];
const collections = ['products', 'orders', 'customers', 'taxes', 'variations'];

const collectionCountsPlugin: RxPlugin = {
	name: 'collection-counts',
	rxdb: true, // this must be true so rxdb knows that this is a rxdb-plugin and not a pouchdb-plugin

	/**
	 * every value in this object can manipulate the prototype of the keynames class
	 * You can manipulate every prototype in this list:
	 * @link https://github.com/pubkey/rxdb/blob/master/src/plugin.ts#L22
	 */
	prototypes: {
		/**
		 * add a function to RxCollection so you can call 'myCollection.hello()'
		 *
		 * @param {object} prototype of RxCollection
		 */
		// RxCollection: (proto: any) => {
		// DON'T DO THIS:
		// proto.totalDocCount$ = new BehaviorSubject(0);
		// proto.unsyncedIds$ = new BehaviorSubject([]);
		// proto.syncedIds$ = new BehaviorSubject([]);
		// },
	},

	/**
	 * some methods are static and can be overwritten in the overwriteable-object
	 */
	// overwritable: {
	// 	validatePassword(password: string) {
	// 		if ((password && typeof password !== 'string') || password.length < 10)
	// 			throw new TypeError('password is not valid');
	// 	},
	// },

	/**
	 * you can add hooks to the hook-list
	 * https://github.com/pubkey/rxdb/blob/master/src/hooks.ts
	 */
	hooks: {
		/**
		 * this hook is called when a collection is created
		 * - add helper for collection total documents, e.g. 'myCollection.totalDocuments$'
		 * - add helper for unsynced documents, e.g. 'myCollection.unsyncedDocuments$'
		 *
		 * @param {RxCollection} collection
		 */
		createRxCollection: {
			after({ collection }) {
				/**
				 * early return
				 */
				if (!collections.includes(collection.name)) {
					return;
				}

				Object.assign(collection, {
					totalDocCount$: new BehaviorSubject(0),
					pullRemoteIds$: new BehaviorSubject([]),
					pushLocalIds$: new BehaviorSubject([]),
					syncedIds$: new BehaviorSubject([]),
				});

				function updateCounts() {
					collection
						.find()
						.exec()
						.then((docs) => {
							const totalDocCount = docs.length;
							const pullRemoteIds = [];
							const pushLocalIds = [];
							const syncedIds = [];
							console.log(collection.name, totalDocCount);

							docs.forEach((doc) => {
								if (doc.id) {
									if (doc.date_modified_gmt) {
										syncedIds.push(doc.id);
									} else {
										pullRemoteIds.push(doc.id);
									}
								} else if (doc._id) {
									pushLocalIds.push(doc._id);
								} else {
									throw new Error(`Orphaned doc: ${String(doc)}`);
								}
							});

							collection.totalDocCount$.next(totalDocCount);
							collection.pullRemoteIds$.next(pullRemoteIds);
							collection.pushLocalIds$.next(pushLocalIds);
							collection.syncedIds$.next(syncedIds);
						})
						.catch((err: any) => {
							console.log(err);
						});
				}

				// collection.$ will emit on insert, update and remove
				// for each emit we are going to loop through all docs for counting
				// debounce is used to group bulk operations
				collection.$.pipe(debounceTime(20)).subscribe(() => {
					updateCounts();
				});

				// update counts on init
				updateCounts();
			},
		},
	},
};

export default collectionCountsPlugin;
