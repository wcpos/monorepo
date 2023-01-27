import { RxPlugin, RxCollection } from 'rxdb';
import { v4 as uuidv4 } from 'uuid';

export const RxDBGenerateIdPlugin: RxPlugin = {
	name: 'generate-id',
	rxdb: true,
	prototypes: {},
	overwritable: {},
	hooks: {
		createRxCollection: {
			after({ collection }) {
				collection.preInsert(function (data) {
					debugger;
					if (!data[collection.schema.primaryPath]) {
						data[collection.schema.primaryPath] = uuidv4();
					}
				}, false);
			},
		},
	},
};
