import { RxCollection, RxPlugin } from 'rxdb';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a UUID if the primary key is not set
 */
export function generateID(this: RxCollection, data: Record<string, any>) {
	const primaryPath = this.schema.primaryPath;
	const hasMetaData = this.schema.jsonSchema.properties.meta_data;
	let metaUUID;

	if (hasMetaData) {
		data.meta_data = data.meta_data || [];
		const meta = data.meta_data.find((meta: any) => meta.key === '_woocommerce_pos_uuid');
		metaUUID = meta && meta.value;
	}

	if (!data[primaryPath] && metaUUID) {
		data[primaryPath] = metaUUID;
	} else if (!data[primaryPath]) {
		const uuid = uuidv4();
		if (primaryPath === 'uuid') {
			data.uuid = uuid;
		} else if (primaryPath === 'localID') {
			data.localID = uuid.slice(0, 8); // only short id required here
		}
	}

	if (hasMetaData && !metaUUID) {
		data.meta_data.push({
			key: '_woocommerce_pos_uuid',
			value: data[primaryPath],
		});
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
