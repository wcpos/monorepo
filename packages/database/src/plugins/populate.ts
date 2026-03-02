import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import isEqual from 'lodash/isEqual';
import isPlainObject from 'lodash/isPlainObject';
import map from 'lodash/map';
import pickBy from 'lodash/pickBy';
import uniq from 'lodash/uniq';
import { ObservableResource } from 'observable-hooks';
import { isRxCollection, RxCollection, RxDocument, RxPlugin } from 'rxdb';
import { combineLatest, of } from 'rxjs';
import { distinctUntilChanged, map as rxMap, startWith, switchMap } from 'rxjs/operators';

/**
 * Get children props from the schema
 * NOTE - this returns an object, not any array
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
			/** TODO - I think this is a bug, shouldn't upsert do an insert if no primary? */
			if (isEmpty(childData[primaryPath])) {
				return childCollection
					.insert(childData)
					.then((doc: RxDocument) => (doc as Record<string, any>)[primaryPath]);
			}
			return childCollection
				.upsert(childData)
				.then((doc: RxDocument) => (doc as Record<string, any>)[primaryPath]);
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
		data[path] = await upsertRef(refCollection, data[path] || []);
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
		throw new Error(error instanceof Error ? error.message : String(error));
	}
}

/**
 *
 */
async function preSave(this: RxCollection, data: any) {
	try {
		await upsertRefs.call(this, data);
	} catch (error) {
		throw new Error(error instanceof Error ? error.message : String(error));
	}
}

/**
 *
 */
async function preRemove(this: RxCollection, data: any) {
	try {
		await removeRefs.call(this, data);
	} catch (error) {
		throw new Error(error instanceof Error ? error.message : String(error));
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
			 * This custom populate$ will emit every time the ids array changes, AND
			 * when the child docuent is deleted/restored.
			 * Deleted documents are filtered out of the end result, but we watch all deleted$ 👀
			 */
			proto.populate$ = function (this: RxDocument, key: string) {
				const refCollection = getRefCollection(this.collection, key);
				return this.get$(key).pipe(
					distinctUntilChanged(isEqual),
					switchMap((ids: string[]) => {
						const validIds = Array.isArray(ids) ? ids.filter((id) => id != null && id !== '') : [];
						if (validIds.length === 0) return of(new Map() as Map<string, RxDocument>);
						return refCollection.findByIds(validIds).exec();
					}),
					switchMap((docsMap: Map<string, RxDocument>) => {
						const docs = [...docsMap.values()];
						if (docs.length === 0) return of([] as RxDocument[]);

						// Map each lineItem to an observable of its deleted$ property
						const deletedObservables = docs.map((doc) => doc.deleted$);

						// Combine the observables into a single observable emitting an array of deleted statuses
						return combineLatest(deletedObservables).pipe(
							startWith(docs.map((doc) => doc.deleted)),
							distinctUntilChanged(isEqual),
							rxMap((deletedArray) => {
								// Filter lineItems based on the deletedArray
								return docs.filter((_, index) => !deletedArray[index]);
							})
						);
					})
				);
			};

			/** */
			proto.toPopulatedJSON = function (this: RxDocument) {
				const childrenProps = getPropsWithRef(this.collection.schema.jsonSchema.properties);
				const latestDoc = this.getLatest();

				// if there are no children, return plain json
				if (isEmpty(childrenProps)) return Promise.resolve(latestDoc.toJSON());

				// get json and populate children
				const json = latestDoc.toMutableJSON();
				const childrenPromises = map(childrenProps, async (object, path) => {
					const childDocs = await latestDoc.populate(path);
					const childPromises = childDocs.map(async (doc: any) => {
						return await doc.toPopulatedJSON();
					});
					(json as Record<string, any>)[path] = await Promise.all(childPromises);
				});

				return Promise.all(childrenPromises).then(() => json);
			};

			/** */
			proto.populateResource = function (this: RxDocument, key: string) {
				const self = this as any;
				if (!self[key + 'Resource']) {
					self[key + 'Resource'] = new ObservableResource(self.populate$(key));
				}
				return self[key + 'Resource'];
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

export { populatePlugin };
