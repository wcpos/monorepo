type RxPlugin = import('rxdb/dist/types').RxPlugin;

const woocommercePlugin: RxPlugin = {
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
		RxCollection: (proto) => {
			proto.hello = function () {
				return 'world';
			};
		},
	},

	/**
	 * some methods are static and can be overwritten in the overwriteable-object
	 */
	overwritable: {
		validatePassword(password) {
			if ((password && typeof password !== 'string') || password.length < 10)
				throw new TypeError('password is not valid');
		},
	},

	/**
	 * you can add hooks to the hook-list
	 */
	hooks: {
		/**
		 * add a foo-property to each document. You can then call myDocument.foo (='bar')
		 */
		createRxDocument(doc) {
			console.log('@TODO - remove this');
			doc.foo = 'bar';
		},
	},
};

export default woocommercePlugin;
