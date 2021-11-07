import { BehaviorSubject } from 'rxjs';
import { debounceTime, shareReplay, tap } from 'rxjs/operators';

type RxPlugin = import('rxdb/dist/types').RxPlugin;
type RxCollection = import('rxdb/dist/types').RxCollection;

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
		// 	proto.hello = function () {
		// 		return 'world';
		// 	};
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
		createRxCollection(collection: RxCollection) {
			Object.assign(collection, {
				totalDocuments: new BehaviorSubject(0),
				unsyncedDocuments: new BehaviorSubject([]),
			});

			Object.assign(collection, {
				// @ts-ignore
				totalDocuments$: collection.totalDocuments.asObservable(),
				// @ts-ignore
				unsyncedDocuments$: collection.unsyncedDocuments.asObservable(),
			});

			// collection.$ will emit on insert, update and remove
			// for each emit we are going to loop through all docs for counting
			// debounce is used to group bulk operations
			// @TODO - optimise counts for specific insert, update and delete
			const count$ = collection.$.pipe(
				debounceTime(20),
				tap(() => {
					// get all docs
					collection.storageInstance.internals.pouch
						.find({
							selector: {},
							fields: ['localID', 'id', 'dateCreatedGmt'],
						})
						.then((result: any) => {
							// count total documents
							console.log(collection.name, result.docs.length);
							// @ts-ignore
							collection.totalRecords.next(result.docs.length);
							// count unsynced documents
							const unsynced = result.docs.filter((doc: any) => {
								return !doc.isSynced();
							});
						})
						.catch((err: any) => {
							console.log(err);
						});
				})
			);

			count$.subscribe();
		},
	},
};

export default collectionCountsPlugin;
