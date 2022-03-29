import * as React from 'react';
import { useFormContext } from '../context';
import { NormalArray } from './normal-array';

export const ArrayField = ({ schema, ...props }) => {
	const { registry } = useFormContext();

	if (!Object.prototype.hasOwnProperty.call(schema, 'items')) {
		const { fields } = registry;
		const { UnsupportedField } = fields;

		return <UnsupportedField schema={schema} reason="Missing items definition" />;
	}
	// if (isMultiSelect(props.schema, rootSchema)) {
	// 	// If array has enum or uniqueItems set to true, call renderMultiSelect() to render the default multiselect widget or a custom widget, if specified.
	// 	return <MultiSelect {...props} registry={registry} />;
	// }
	// if (isCustomWidget(props.uiSchema)) {
	// 	return <CustomWidget {...props} registry={registry} />;
	// }
	// if (isFixedItems(props.schema)) {
	// 	return <FixedArray {...props} registry={registry} />;
	// }
	// if (isFilesArray(props.schema, props.uiSchema, rootSchema)) {
	// 	return <FilesArray {...props} registry={registry} />;
	// }
	return <NormalArray {...props} schema={schema} />;
};
