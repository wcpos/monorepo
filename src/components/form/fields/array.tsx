import * as React from 'react';
import { useFormContext } from '../context';
import { isMultiSelect, isCustomWidget, isFixedItems, isFilesArray } from '../form.helpers';
import { NormalArray } from './normal-array';
import { FixedArray } from './fixed-array';
import { MultiSelectField } from './multi-select';
import { CustomWidget } from './custom-widget';
import { FilesArray } from './files-array';

export const ArrayField = ({ schema, uiSchema, ...props }) => {
	const { registry, rootSchema } = useFormContext();

	if (!Object.prototype.hasOwnProperty.call(schema, 'items')) {
		const { UnsupportedField } = registry.fields;
		return <UnsupportedField schema={schema} reason="Missing items definition" />;
	}

	if (isMultiSelect(schema, rootSchema)) {
		// If array has enum or uniqueItems set to true, call renderMultiSelect() to render the default multiselect widget or a custom widget, if specified.
		return <MultiSelectField {...props} schema={schema} uiSchema={uiSchema} />;
	}
	if (isCustomWidget(uiSchema)) {
		return <CustomWidget {...props} schema={schema} uiSchema={uiSchema} />;
	}
	if (isFixedItems(schema)) {
		return <FixedArray {...props} schema={schema} uiSchema={uiSchema} />;
	}
	if (isFilesArray(schema, uiSchema, rootSchema)) {
		return <FilesArray {...props} schema={schema} uiSchema={uiSchema} />;
	}
	return <NormalArray {...props} schema={schema} uiSchema={uiSchema} />;
};
