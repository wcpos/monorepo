import forEach from 'lodash/forEach';
import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import isInteger from 'lodash/isInteger';
import isPlainObject from 'lodash/isPlainObject';
import map from 'lodash/map';
import pickBy from 'lodash/pickBy';
import uniq from 'lodash/uniq';
import { isRxCollection } from 'rxdb';
import { switchMap, tap } from 'rxjs/operators';

type RxPlugin = import('rxdb/dist/types').RxPlugin;
type RxCollection = import('rxdb').RxCollection;
type RxDocument = import('rxdb').RxDocument;

/**
 * Get children props from the schema
 * @NOTE - this returns an object, not any array
 */
function getPropsWithRef(properties: Record<string, any>) {
	return pickBy(properties, (property) => !!property?.ref);
}

/**
 *
 */
function getRefCollection(collection: RxCollection, path: string): RxCollection {
	const name = get(collection, ['schema', 'jsonSchema', 'properties', path, 'ref']);
	const refCollection = get(collection, ['database', 'collections', name]);
	if (!isRxCollection(refCollection)) {
		throw new Error(`Could not find ref collection: ${path}`);
	}
	return refCollection;
}

/**
 *
 */
async function upsertRef(childCollection: RxCollection, data: any[]) {
	const childPromises = data.map(async (childData) => {
		if (isPlainObject(childData)) {
			const primaryPath = childCollection.schema.primaryPath;
			if (isEmpty(childData[primaryPath])) {
				return childCollection.insert(childData).then((doc: RxDocument) => doc[primaryPath]);
			}
			return childCollection.upsert(childData).then((doc: RxDocument) => doc[primaryPath]);
		}
		return Promise.resolve(childData);
	});

	return Promise.all(childPromises).then(uniq);
}

/**
 *
 */
async function upsertRefs(this: RxCollection, data: any) {
	const childrenProps = getPropsWithRef(this.schema.jsonSchema.properties);
	const collection = this;

	const childrenPromises = map(childrenProps, async (object, path) => {
		const refCollection = getRefCollection(collection, path);
		const childrenData = data[path] || [];
		data[path] = await upsertRef(refCollection, childrenData);
	});

	return Promise.all(childrenPromises);
}

/**
 *
 */
async function removeRefs(this: RxCollection, data: any) {
	const childrenProps = getPropsWithRef(this.schema.jsonSchema.properties);
	const collection = this;

	const childrenPromises = map(childrenProps, async (object, path) => {
		const refCollection = getRefCollection(collection, path);
		return refCollection.bulkRemove(data[path] || []);
	});

	return Promise.all(childrenPromises);
}

/**
 *
 */
async function preInsert(this: RxCollection, data: any) {
	try {
		await upsertRefs.call(this, data);
	} catch (error) {
		throw new Error(error);
	}
}

/**
 *
 */
async function preSave(this: RxCollection, data: any) {
	try {
		await upsertRefs.call(this, data);
	} catch (error) {
		throw new Error(error);
	}
}

/**
 *
 */
async function preRemove(this: RxCollection, data: any) {
	try {
		await removeRefs.call(this, data);
	} catch (error) {
		throw new Error(error);
	}
}

/**
 *
 */
const populatePlugin: RxPlugin = {
	name: 'populate',
	rxdb: true,

	/**
	 * every value in this object can manipulate the prototype of the keynames class
	 * You can manipulate every prototype in this list:
	 * @link https://github.com/pubkey/rxdb/blob/master/src/plugin.ts#L22
	 */
	prototypes: {
		RxCollection: (proto: any) => {
			proto.upsertRefs = upsertRefs;
			proto.removeRefs = removeRefs;
		},
		RxDocument: (proto: any) => {
			/**
			 *
			 */
			proto.populate$ = function (this: RxDocument, key: string) {
				const refCollection = getRefCollection(this.collection, key);
				return this.get$(key).pipe(
					switchMap((ids: string[]) =>
						refCollection
							.findByIds(ids)
							.exec()
							.then((res) => {
								const valuesIterator = res.values();
								return Array.from(valuesIterator) as any;
							})
					)
				);
			};
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
				collection.preInsert(preInsert, false);
				collection.preSave(preSave, false);
				collection.preRemove(preRemove, false);
			},
		},
	},
};

export default populatePlugin;
