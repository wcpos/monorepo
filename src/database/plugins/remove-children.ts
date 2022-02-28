import pickBy from 'lodash/pickBy';
import map from 'lodash/map';
import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import isPlainObject from 'lodash/isPlainObject';

type RxPlugin = import('rxdb/dist/types').RxPlugin;
type RxCollection = import('rxdb/plugins/core').RxCollection;
type RxDocument = import('rxdb/plugins/core').RxDocument;

/**
 *
 */
const isJSONArray = (data: any) => {
	return Array.isArray(data) && data.every((item) => isPlainObject(item));
};

/**
 *
 */
async function preInsertOrSave(this: RxCollection, data: any) {
	const hasChildren = pickBy(this.schema.jsonSchema.properties, (property) => !!property?.ref);

	if (isEmpty(hasChildren)) return;

	map(hasChildren, async (object, key) => {
		const childCollection = get(this, `database.collections.${object?.ref}`);

		if (childCollection && isJSONArray(data[key])) {
			const promises = data[key].map(async (item) => {
				// only upsert if it's a plain object
				if (item && isPlainObject(item)) {
					/** @TODO - why doesn't upsert trigger the preInsert or preSave */
					return childCollection
						.upsert(childCollection.parseRestResponse(item))
						.then((doc) => doc._id);
				}
			});

			const ids = await Promise.all(promises);
			data[key] = ids;
		}
	});
}

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
			collection.preInsert(preInsertOrSave, false);
			collection.preSave(preInsertOrSave, false);

			collection.preRemove(async function (plainData: any, rxDocument: RxDocument) {
				// check schema to see which props have children
				const hasChildren = pickBy(
					collection.schema.jsonSchema.properties,
					(property) => !!property.ref
				);

				// if there are no children, return
				if (!hasChildren) return;

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
