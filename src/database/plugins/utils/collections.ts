type RxPlugin = import('rxdb/dist/types').RxPlugin;
type RxCollection = import('rxdb/plugins/core').RxCollection;
type RxDocument = import('rxdb/plugins/core').RxDocument;
// type Model = import('rxdb/dist/types/types/rx-collection').RxCollectionCreatorBase;

const collectionsHelperPlugin: RxPlugin = {
	name: 'collections-helper',
	rxdb: true,
	prototypes: {},
	overwritable: {},
	hooks: {
		preCreateRxCollection(model: any) {
			if (!model.statics) model.statics = {};
			if (!model.methods) model.methods = {};

			model.statics.collections = function collections(this: RxCollection) {
				return this.database.collections;
			};

			model.methods.collections = function collections(this: RxDocument) {
				return this.collection.database.collections;
			};

			return model;
		},
	},
};

export default collectionsHelperPlugin;
