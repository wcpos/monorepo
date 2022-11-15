import isEmpty from 'lodash/isEmpty';
import map from 'lodash/map';
import pickBy from 'lodash/pickBy';

type RxPlugin = import('rxdb/dist/types').RxPlugin;
type RxDocument = import('rxdb/dist/types').RxDocument;

async function toRestApiJSON(this: RxDocument) {
	const json = { ...this.toJSON() };

	const hasChildren = pickBy(
		this.collection.schema.jsonSchema.properties,
		(property) => !!property.ref
	);

	// if there are no children, return plain json
	if (isEmpty(hasChildren)) return Promise.resolve(json);

	await Promise.all(
		map(hasChildren, async (object, key) =>
			this.populate(key)
				.then((children) => {
					return Promise.all((children || []).map((child) => child.toRestApiJSON()));
				})
				.then((childrenJSON) => {
					json[key] = childrenJSON;
				})
		)
	);

	return json;
}

const toJSONPlugin: RxPlugin = {
	name: 'to-json',
	rxdb: true, // this must be true so rxdb knows that this is a rxdb-plugin and not a pouchdb-plugin

	/**
	 * every value in this object can manipulate the prototype of the keynames class
	 * You can manipulate every prototype in this list:
	 * @link https://github.com/pubkey/rxdb/blob/master/src/plugin.ts#L22
	 */
	prototypes: {
		RxDocument: (proto: any) => {
			proto.toRestApiJSON = toRestApiJSON;
		},
	},

	/**
	 * some methods are static and can be overwritten in the overwriteable-object
	 */
	overwritable: {
		// validatePassword(password: string) {
		// 	if ((password && typeof password !== 'string') || password.length < 10)
		// 		throw new TypeError('password is not valid');
		// },
	},

	/**
	 * you can add hooks to the hook-list
	 * https://github.com/pubkey/rxdb/blob/master/src/hooks.ts
	 */
	hooks: {
		/**
		 * add a foo-property to each document. You can then call myDocument.foo (='bar')
		 */
		// createRxDocument(doc: RxDocument) {
		// 	console.log('@TODO - remove this');
		// 	// @ts-ignore
		// 	doc.foo = 'bar';
		// },
	},
};

export default toJSONPlugin;
