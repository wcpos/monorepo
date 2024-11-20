import forEach from 'lodash/forEach';

type RxPlugin = import('rxdb/dist/types').RxPlugin;
type RxCollection = import('rxdb/dist/types').RxCollection;

const middlewaresPlugin: RxPlugin = {
	name: 'middleswares',
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
	overwritable: {},

	/**
	 * you can add hooks to the hook-list
	 * https://github.com/pubkey/rxdb/blob/master/src/hooks.ts
	 */
	hooks: {
		/**
		 *
		 */
		createRxCollection: {
			after({ collection }) {
				/**
				 * Allow colections to set middleware-hooks via config options
				 * needs to allow for promises
				 */
				forEach(collection.options.middlewares, (middleware, hook) => {
					const { handle, parallel } = middleware;
					collection[hook](handle, parallel);
				});

				return collection;
			},
		},
	},
};

export default middlewaresPlugin;
