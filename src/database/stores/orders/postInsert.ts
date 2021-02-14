import difference from 'lodash/difference';
import unset from 'lodash/unset';

// @TODO - turn this into a plugin?
export default (plainData, rxDocument): void => {
	// // remove _links property (invalid property name)
	// unset(rawData, '_links');

	// // change id to string
	// rawData.id = String(rawData.id);

	// // remove propeties not on schema
	// const omitProperties = difference(Object.keys(rawData), this.schema.topLevelFields);
	// if (omitProperties.length > 0) {
	// 	console.log('the following properties are being omitted', omitProperties);
	// 	omitProperties.forEach((prop) => {
	// 		unset(rawData, prop);
	// 	});
	// }

	// bulkInsert line items
	rxDocument.collections().line_items.bulkInsertFromOrder(plainData.line_items, plainData.id);
	// rxDocument.collections().fee_lines.bulkInsertFromOrder(plainData.fee_lines, plainData.id);

	// extract line_item ids
	// rawData.line_items = rawData.line_items.map((line_item) => String(line_item.id));
	// rawData.fee_lines = rawData.fee_lines.map((fee_line) => String(fee_line.id));
};
