import { RxPlugin, RxCollection } from 'rxdb/plugins/core'
import randomToken from 'random-token';

export function generateId(): string {
	return randomToken(10) + ':' + Date.now();
}

export const RxDBGenerateIdPlugin: RxPlugin = {
	name: 'generate-id',
	rxdb: true,
	prototypes: {},
	overwritable: {},
	hooks: {
		createRxCollection(collection: RxCollection) {
			collection.preInsert(function (data) {
				if (!data[collection.schema.primaryPath]) {
					data[collection.schema.primaryPath] = generateId();
				}
			}, false);
		},
	},
};
