import { auditRestApiIds } from './audit-ids';

type RxPlugin = import('rxdb/dist/types').RxPlugin;
type RxCollection = import('rxdb/dist/types').RxCollection;

export const auditIdsPlugin: RxPlugin = {
	name: 'audit-ids',
	rxdb: true, // this must be true so rxdb knows that this is a rxdb-plugin and not a pouchdb-plugin

	/**
	 * every value in this object can manipulate the prototype of the keynames class
	 * You can manipulate every prototype in this list:
	 * @link https://github.com/pubkey/rxdb/blob/master/src/plugin.ts#L22
	 */
	prototypes: {},

	/**
	 * some methods are static and can be overwritten in the overwriteable-object
	 */
	overwritable: {},

	/**
	 * you can add hooks to the hook-list
	 * https://github.com/pubkey/rxdb/blob/master/src/hooks.ts
	 */
	hooks: {
		createRxCollection(collection: RxCollection) {
			Object.assign(collection, { auditRestApiIds });
		},
	},
};
