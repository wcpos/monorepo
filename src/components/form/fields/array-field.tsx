import * as React from 'react';
import { isMultiSelect, isCustomWidget, isFixedItems, isFilesArray } from '../form.helpers';
import { MultiSelect } from './array/multi-select';
import { CustomWidget } from './array/custom-widget';
import { FixedArray } from './array/fixed-array';
import { FilesArray } from './array/files-array';
import { NormalArray } from './array/normal-array';

/**
 *
 */
export function ArrayField<T extends object>(
	props: import('../types').FieldProps<T>
): React.ReactElement {
	const { rootSchema } = props.registry;
	if (!props.schema.hasOwnProperty('items')) {
		const { fields } = props.registry;
		const { UnsupportedField } = fields;

		return (
			<UnsupportedField
				schema={props.schema}
				idSchema={props.idSchema}
				reason="Missing items definition"
			/>
		);
	}
	if (isMultiSelect(props.schema, rootSchema)) {
		// If array has enum or uniqueItems set to true, call renderMultiSelect() to render the default multiselect widget or a custom widget, if specified.
		return <MultiSelect {...props} />;
	}
	if (isCustomWidget(props.uiSchema)) {
		return <CustomWidget {...props} />;
	}
	if (isFixedItems(props.schema)) {
		return <FixedArray {...props} />;
	}
	if (isFilesArray(props.schema, props.uiSchema, rootSchema)) {
		return <FilesArray {...props} />;
	}
	return <NormalArray {...props} />;
}
