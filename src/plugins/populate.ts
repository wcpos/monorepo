import forEach from 'lodash/forEach';
import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import isInteger from 'lodash/isInteger';
import isPlainObject from 'lodash/isPlainObject';
import map from 'lodash/map';
import pickBy from 'lodash/pickBy';
import uniq from 'lodash/uniq';
import { switchMap, tap } from 'rxjs/operators';

type RxPlugin = import('rxdb/dist/types').RxPlugin;
type RxCollection = import('rxdb').RxCollection;
type RxDocument = import('rxdb').RxDocument;

/**
 * Get children props from the schema
 * @NOTE - this returns an object, not any array
 */
function getChildrenProps(properties: Record<string, any>) {
	return pickBy(properties, (property) => !!property?.ref);
}

/**
 *
 */
async function upsertChild(childCollection: RxCollection, data: any[]) {
	const childPromises = data.map(async (childData) => {
		if (isPlainObject(childData)) {
			return childCollection.upsert(childData).then((doc: RxDocument) => doc.uuid);
		}
		return Promise.resolve(childData);
	});

	return Promise.all(childPromises).then((ids) => {
		debugger;
		return uniq(ids);
	});
}

/**
 *
 */
async function upsertChildren(this: RxCollection, data: any) {
	const childrenProps = getChildrenProps(this.schema.jsonSchema.properties);

	const childrenPromises = map(childrenProps, async (object, key) => {
		const childCollection = get(this, `database.collections.${object?.ref}`);
		const childrenData = data[key] || [];
		data[key] = await upsertChild(childCollection, childrenData);
	});

	return Promise.all(childrenPromises);
}

/**
 *
 */
async function removeChildren(this: RxCollection, data: any) {
	const childrenProps = getChildrenProps(this.schema.jsonSchema.properties);

	const childrenPromises = map(childrenProps, async (object, key) => {
		const childCollection = get(this, `database.collections.${object?.ref}`);
		return childCollection.bulkRemove(data[key] || []);
	});

	return Promise.all(childrenPromises);
}

/**
 *
 */
async function preInsert(this: RxCollection, data: any) {
	debugger;
	await upsertChildren.call(this, data);
}

/**
 *
 */
async function preSave(this: RxCollection, data: any) {
	debugger;
	await upsertChildren.call(this, data);
}

/**
 *
 */
async function preRemove(this: RxCollection, data: any) {
	debugger;
	await removeChildren.call(this, data);
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
			proto.upsertChildren = upsertChildren;
			proto.removeChildren = removeChildren;
		},
		RxDocument: (proto: any) => {
			proto.populate$ = function (this: RxDocument, key: string) {
				return this.get$(key).pipe(
					switchMap(async (ids: string[]) => {
						console.log(this.get('sites'));
						// const children = await this.populate(key);
						const childCollection = get(this, `collection.database.collections.${key}`);
						const children = childCollection
							.findByIds(ids)
							.exec()
							.then((res) => {
								const valuesIterator = res.values();
								return Array.from(valuesIterator) as any;
							});
						return children;
					})
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
		// createRxDocument: {
		// 	before(document) {
		// 		const childrenProps = getChildrenProps(document.collection.schema.jsonSchema.properties);
		// 		forEach(childrenProps, (object, key) => {
		// 			Object.assign(document, {
		// 				[`${key}_$`]: document.get$(key).pipe(
		// 					tap((res) => {
		// 						debugger;
		// 					}),
		// 					switchMap(async (ids: string[]) => {
		// 						const children = await document.populate(key);
		// 						debugger;

		// 						return children;
		// 					})
		// 				),
		// 			});
		// 		});
		// 	},
		// },
	},
};

export default populatePlugin;
