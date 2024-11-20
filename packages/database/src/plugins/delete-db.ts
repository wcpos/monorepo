import log from '@wcpos/utils/src/logger';

type RxPlugin = import('rxdb/dist/types').RxPlugin;

const deleteDBPlugin: RxPlugin = {
	name: 'delete-db',
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
		 * TODO - this doesn't work, the storage is recreated
		 * I need to write a separate script which does clean up
		 */
		postRemoveRxDatabase: {
			after: ({ storage, databaseName }) => {
				if (storage?.name === 'indexeddb') {
					const DBDeleteRequest = window.indexedDB.deleteDatabase(databaseName);
					DBDeleteRequest.onerror = (event) => {
						log.error('Error deleting database.');
					};
					DBDeleteRequest.onsuccess = (event) => {
						log.debug('Database deleted successfully', event);
					};
				}
			},
		},
	},
};

export default deleteDBPlugin;
