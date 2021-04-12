import difference from 'lodash/difference';
import unset from 'lodash/unset';

// @TODO - turn this into a plugin?
export default (rawData: Record<string, unknown>) => {
	// remove _links property (invalid property name)
	// unset(rawData, '_links');
	// remove propeties not on schema
	// const omitProperties = difference(Object.keys(rawData), this.schema.topLevelFields);

	// if (omitProperties.length > 0) {
	// 	console.log('the following properties are being omiited', omitProperties);
	// 	omitProperties.forEach((prop) => {
	// 		unset(rawData, prop);
	// 	});
	// }

	// change id to string
	rawData.id = String(rawData.id);
};
