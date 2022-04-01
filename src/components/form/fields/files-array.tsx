import * as React from 'react';
import { getUiOptions } from '../form.helpers';
import { getWidget } from '../widgets';
import { useFormContext } from '../context';

export const FilesArray = <T extends object>({
	schema,
	formData,
	name,
	uiSchema,
	...props
}: import('../../types').FieldProps<T>) => {
	const { registry } = useFormContext();
	const { widget = 'files', ...options } = getUiOptions(uiSchema);
	const Widget = getWidget(schema, widget, registry.widgets);

	const handleSelectChange = React.useCallback(
		(value) => {
			props.onChange(value);
		},
		[props]
	);

	return (
		<Widget
			multiple
			label={schema.title || name}
			schema={schema}
			value={formData}
			options={options}
			onChange={handleSelectChange}
		/>
	);
};
