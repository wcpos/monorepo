import pickBy from 'lodash/pickBy';
import map from 'lodash/map';
import get from 'lodash/get';

type RxPlugin = import('rxdb/dist/types').RxPlugin;
type RxCollection = import('rxdb/plugins/core').RxCollection;
type RxDocument = import('rxdb/plugins/core').RxDocument;

const removeChildrenPlugin: RxPlugin = {
	name: 'remove-children',
	rxdb: true,

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
			collection.preRemove(async function (plainData: any, rxDocument: RxDocument) {
				// check schema to see which props have children
				const hasChildren = pickBy(
					collection.schema.jsonSchema.properties,
					(property) => !!property.ref
				);

				// bulk remove all children
				const promises = map(hasChildren, (object, key) => {
					const childCollection = get(collection, `database.collections.${object.ref}`);
					if (Array.isArray(plainData[key]) && childCollection) {
						return childCollection.bulkRemove(plainData[key]);
					}
					return Promise.resolve();
				});

				return Promise.all(promises).catch((err) => {
					console.warn(err);
				});
			}, false);
		},
	},
};

export default removeChildrenPlugin;
