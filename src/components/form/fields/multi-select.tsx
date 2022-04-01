import * as React from 'react';
import { useFormContext } from '../context';
import { retrieveSchema, optionsList, getUiOptions } from '../form.helpers';
import { getWidget } from '../widgets';

export const MultiSelectField = ({ schema, formData, uiSchema, name, ...props }) => {
	const { registry, rootSchema } = useFormContext();
	const itemsSchema = retrieveSchema(schema.items, rootSchema, formData);
	const enumOptions = optionsList(itemsSchema);
	const { widget = 'select', ...options } = {
		...getUiOptions(uiSchema),
		enumOptions,
	};
	const Widget = getWidget(schema, widget, registry.widgets);

	return (
		<Widget
			multiple
			label={schema.title || name}
			schema={schema}
			value={formData}
			options={options}
			{...props}
		/>
	);
};
