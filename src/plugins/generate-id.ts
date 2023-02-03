import { RxCollection, RxPlugin } from 'rxdb';
import { v4 as uuidv4 } from 'uuid';

/**
 *
 */
export function getMetaUUID(this: RxCollection, data: Record<string, any>) {
	const primaryPath = this.schema.primaryPath;

	if (!data[primaryPath] && data.meta_data) {
		const metaUuid = data.meta_data.find((meta: any) => meta.key === '_woocommerce_pos_uuid');
		if (metaUuid) {
			data[primaryPath] = metaUuid.value;
		}
	}
}

/**
 * Generate a UUID if the primary key is not set
 */
export function generateID(this: RxCollection, data: Record<string, any>) {
	const primaryPath = this.schema.primaryPath;
	getMetaUUID.call(this, data);

	if (!data[primaryPath]) {
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
			proto.getMetaUUID = getMetaUUID;
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
