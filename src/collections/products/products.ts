import {
	RxConflictHandler,
	RxConflictHandlerInput,
	RxConflictHandlerOutput,
	deepEqual,
} from 'rxdb';

import log from '@wcpos/utils/src/logger';

import schema from './schema.json';
type RxCollectionCreator = import('rxdb').RxCollectionCreator;

export type ProductSchema = import('./interface').WooCommerceProductSchema;
export type ProductDocument = import('rxdb').RxDocument<ProductSchema, ProductMethods>;
export type ProductCollection = import('rxdb').RxCollection<
	ProductDocument,
	ProductMethods,
	ProductStatics
>;

type ProductStatics = Record<string, never>;
type ProductMethods = Record<string, never>;

/**
 *
 */
const conflictHandler: RxConflictHandler<any> = function (
	/**
	 * The conflict handler gets 3 input properties:
	 * - assumedMasterState: The state of the document that is assumed to be on the master branch
	 * - newDocumentState: The new document state of the fork branch (=client) that RxDB want to write to the master
	 * - realMasterState: The real master state of the document
	 */
	i: RxConflictHandlerInput<any>
): Promise<RxConflictHandlerOutput<any>> {
	/**
	 * Here we detect if a conflict exists in the first place.
	 * If there is no conflict, we return isEqual=true.
	 * If there is a conflict, return isEqual=false.
	 * In the default handler we do a deepEqual check,
	 * but in your custom conflict handler you probably want
	 * to compare specific properties of the document, like the updatedAt time,
	 * for better performance because deepEqual() is expensive.
	 */
	if (deepEqual(i.newDocumentState, i.realMasterState)) {
		return Promise.resolve({
			isEqual: true,
		});
	}

	log.error('conflictHandler', i);

	/**
	 * If a conflict exists, we have to resolve it.
	 * The default conflict handler will always
	 * drop the fork state and use the master state instead.
	 *
	 * In your custom conflict handler you likely want to merge properties
	 * of the realMasterState and the newDocumentState instead.
	 */
	return Promise.resolve({
		isEqual: false,
		documentData: i.newDocumentState,
	});
};

/**
 *
 */
export const products: RxCollectionCreator = {
	schema,
	localDocuments: true, // needed for custom checkpoint
	migrationStrategies: {},
	options: {
		searchFields: ['name', 'sku', 'barcode'],
	},
	// conflictHandler,
};
