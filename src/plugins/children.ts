import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import isInteger from 'lodash/isInteger';
import isPlainObject from 'lodash/isPlainObject';
import map from 'lodash/map';
import pickBy from 'lodash/pickBy';

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
 * get children props from the schema
 */
function getChildrenProps(this: RxCollection) {
	return pickBy(this.schema.jsonSchema.properties, (property) => !!property?.ref);
}

/**
 *
 */
async function upsertChildren(this: RxCollection, data: any) {
	const childrenProps = getChildrenProps.call(this);

	// early return
	if (isEmpty(childrenProps)) return;

	const allUpsertPromises = map(childrenProps, async (object, key) => {
		let docs = [];
		const childCollection = get(this, `database.collections.${object?.ref}`);
		const children = data[key];

		// early return
		if (isEmpty(children)) return;

		if (isJSONArray(children)) {
			docs = await childCollection.bulkUpsert(childCollection.bulkParseRestResponse(children));
		}

		if (isIntegerArray(children)) {
			docs = await childCollection.bulkUpsert(
				childCollection.bulkParseRestResponse(children.map((id: number) => ({ id })))
			);
		}

		if (docs.length > 0) {
			data[key] = docs.filter((doc) => !!doc).map((doc) => doc._id);
		}
	});

	await Promise.all(allUpsertPromises).catch((err) => {
		console.warn(err);
	});
}

/**
 *
 */
async function removeChildren(this: RxCollection, plainData: any, rxDocument: RxDocument) {
	const childrenProps = getChildrenProps.call(this);

	// early return
	if (isEmpty(childrenProps)) return;

	// bulk remove all children
	const promises = map(childrenProps, async (object, key) => {
		const childCollection = get(this, `database.collections.${object.ref}`);
		if (Array.isArray(plainData[key]) && childCollection) {
			await childCollection.bulkRemove(plainData[key]);
		}
	});

	await Promise.all(promises).catch((err) => {
		console.warn(err);
	});
}

/**
 *
 */
const childrenPlugin: RxPlugin = {
	name: 'children',
	rxdb: true,

	/**
	 * every value in this object can manipulate the prototype of the keynames class
	 * You can manipulate every prototype in this list:
	 * @link https://github.com/pubkey/rxdb/blob/master/src/plugin.ts#L22
	 */
	prototypes: {
		RxCollection: (proto: any) => {
			// proto.syncRestApi = syncRestApiCollection;
			// proto.bulkUpsertFromServer = bulkUpsertFromServer;
			proto.getChildrenProps = getChildrenProps;
			proto.upsertChildren = upsertChildren;
			proto.removeChildren = removeChildren;
		},
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
		createRxCollection: {
			after({ collection }) {
				// collection.preInsert(insertOrSaveChildren, false);
				// collection.preSave(insertOrSaveChildren, false);
				collection.preRemove(removeChildren, false);
			},
		},
	},
};

export default childrenPlugin;
