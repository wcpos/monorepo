import * as React from 'react';
import {
	isMultiSelect,
	isCustomWidget,
	isFixedItems,
	isFilesArray,
	getDefaultRegistry,
} from '../form.helpers';
import { MultiSelect } from './array/multi-select';
import { CustomWidget } from './array/custom-widget';
import { FixedArray } from './array/fixed-array';
import { FilesArray } from './array/files-array';
import { NormalArray } from './array/normal-array';

/**
 *
 */
export function ArrayField<T extends object>({
	registry = getDefaultRegistry(),
	...props
}: import('../types').FieldProps<T>): React.ReactElement {
	const { rootSchema } = registry;

	if (!props.schema.hasOwnProperty('items')) {
		const { fields } = registry;
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
		return <MultiSelect {...props} registry={registry} />;
	}
	if (isCustomWidget(props.uiSchema)) {
		return <CustomWidget {...props} registry={registry} />;
	}
	if (isFixedItems(props.schema)) {
		return <FixedArray {...props} registry={registry} />;
	}
	if (isFilesArray(props.schema, props.uiSchema, rootSchema)) {
		return <FilesArray {...props} registry={registry} />;
	}
	return <NormalArray {...props} registry={registry} />;
}
