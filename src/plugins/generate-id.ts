import { RxCollection, RxPlugin } from 'rxdb';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a UUID if the primary key is not set
 */
function generateID(this: RxCollection, data: Record<string, any>) {
	const primaryPath = this.schema.primaryPath;

	if (!data[this.schema.primaryPath]) {
		const uuid = uuidv4();
		if (primaryPath === 'uuid') {
			data.uuid = uuid;
		} else if (primaryPath === 'localID') {
			data.localID = uuid.slice(0, 8); // only short id required here
		}
	}
}

export const RxDBGenerateIdPlugin: RxPlugin = {
	name: 'generate-id',
	rxdb: true,
	prototypes: {
		RxCollection: (proto: any) => {
			proto.generateID = generateID;
		},
	},
	overwritable: {},
	hooks: {
		createRxCollection: {
			after({ collection }) {
				collection.preInsert(generateID, false);
				collection.preSave(generateID, false);
			},
		},
	},
};
