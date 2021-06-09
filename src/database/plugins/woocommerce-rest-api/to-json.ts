import unset from 'lodash/unset';
import snakeCase from 'lodash/snakeCase';
import forEach from 'lodash/forEach';
import invokeMap from 'lodash/invokeMap';

type RxCollection = import('rxdb/dist/types').RxCollection;
type RxDocument = import('rxdb/dist/types').RxDocument;
export type Document = RxDocument & {
	toRestApiJSON: () => Record<string, unknown>;
	collections: () => Record<string, RxCollection>;
};

/**
 *
 */
 export async function toRestApiJSON(this: Document) {
	const json: Record<string, unknown> = this.toJSON();

	if (this.collection.name === 'orders') {
		json.line_items = await this.populate('lineItems').then((items) =>
			Promise.all(invokeMap(items, toRestApiJSON))
		);
		json.fee_lines = await this.populate('feeLines').then((items) =>
			Promise.all(invokeMap(items, toRestApiJSON))
		);
		json.shipping_lines = await this.populate('shippingLines').then((items) =>
			Promise.all(invokeMap(items, toRestApiJSON))
		);

		unset(json, 'lineItems');
		unset(json, 'feeLines');
		unset(json, 'shippingLines');
	}

	// reverse camelCase for WC REST API
	forEach(json, (data, key) => {
		const privateProperties = ['_id', '_attachments', '_rev'];
		const snakeCaseKey = snakeCase(key);
		if (!privateProperties.includes(key) && key !== snakeCaseKey) {
			json[snakeCaseKey] = data;
			unset(json, key);
		}
	});

	return json;
}