import randomToken from 'random-token';
import { RxPlugin, RxCollection } from 'rxdb';

export function generateId(): string {
	return `${randomToken(10)}:${Date.now()}`;
}

export const RxDBGenerateIdPlugin: RxPlugin = {
	name: 'generate-id',
	rxdb: true,
	prototypes: {},
	overwritable: {},
	hooks: {
		createRxCollection: {
			after({ collection }) {
				collection.preInsert(function (data) {
					if (!data[collection.schema.primaryPath]) {
						data[collection.schema.primaryPath] = generateId();
					}
				}, false);
			},
		},
	},
};
