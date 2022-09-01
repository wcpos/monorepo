import pickBy from 'lodash/pickBy';
import map from 'lodash/map';
import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import isPlainObject from 'lodash/isPlainObject';
import isInteger from 'lodash/isInteger';

type RxPlugin = import('rxdb/dist/types').RxPlugin;
type RxCollection = import('rxdb').RxCollection;
type RxDocument = import('rxdb').RxDocument;

/**
 * Check if the given value is a JSON array
 * Note: empty arrays should return false
 */
const isJSONArray = (data: any) => {
	return Array.isArray(data) && data.length > 0 && data.every((item) => isPlainObject(item));
};

/**
 * Check if the given value is a JSON array
 * Note: empty arrays should return false
 */
const isIntegerArray = (data: any) => {
	return Array.isArray(data) && data.length > 0 && data.every((item) => isInteger(item));
};

/**
 *
 */
async function preInsertOrSave(this: RxCollection, data: any) {
	const hasChildren = pickBy(this.schema.jsonSchema.properties, (property) => !!property?.ref);

	if (isEmpty(hasChildren)) return Promise.resolve();

	const waitForAllProps = map(hasChildren, async (object, key) => {
		const childCollection = get(this, `database.collections.${object?.ref}`);

		/**
		 * This is fragile
		 * - plain JSON is okay, that's data from the WC REST API
		 * - integers .. most likely something like product variations, but could be edge cases
		 *
		 * Do we really want to update the children for each parent save?
		 * ie: it could be changing something unrelated
		 */
		if (childCollection) {
			if (isJSONArray(data[key]) || isIntegerArray(data[key])) {
				console.log(`Upserting children for ${this.name}.${key}`);
				const waitForUpsertChildren = data[key].map(async (item) => {
					// only upsert if it's a plain object
					if (item && isPlainObject(item)) {
						return childCollection.upsert(childCollection.parseRestResponse(item));
					}
					// what about case like variations? an array of integers
					if (item && isInteger(item)) {
						return childCollection.upsert(childCollection.parseRestResponse({ id: item }));
					}
					return Promise.resolve();
				});

				return Promise.all(waitForUpsertChildren).then((docs) => {
					if (docs.length > 0) {
						data[key] = docs.filter((doc) => !!doc).map((doc) => doc._id);
					}
				});
			}
		}

		return Promise.resolve().catch((err) => {
			console.warn(err);
		});
	});

	return Promise.all(waitForAllProps);
}

const childrenPlugin: RxPlugin = {
	name: 'children',
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
		createRxCollection: {
			after({ collection }) {
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
	},
};

export default childrenPlugin;
