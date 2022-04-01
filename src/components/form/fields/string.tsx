import * as React from 'react';
import { useFormContext } from '../context';
import { isSelect, optionsList, getUiOptions } from '../form.helpers';
import { hasWidget, getWidget } from '../widgets';

interface StringFieldProps {
	schema: import('../types').Schema;
	formData: any;
	name: string;
}

export const StringField = ({ schema, formData, name, idSchema, uiSchema }: StringFieldProps) => {
	const [value, setValue] = React.useState(formData);
	const { registry, onChange } = useFormContext();
	const enumOptions = isSelect(schema) && optionsList(schema);
	let defaultWidget = enumOptions ? 'select' : 'text';

	if (schema.format && hasWidget(schema, schema.format, registry.widgets)) {
		defaultWidget = schema.format;
	}

	const { widget = defaultWidget, placeholder = '', ...options } = getUiOptions(uiSchema);
	const Widget = getWidget(schema, widget, registry.widgets);

	/**
	 * How best to handle changes?
	 * - would rather if the textinput didn't update the form data on every change
	 * - either use a ref to reach and get the value, or store temporary value in state here
	 */
	const handleOnBlur = React.useCallback(() => {
		if (onChange) {
			onChange({ [idSchema.$id]: value });
		}
	}, [idSchema, onChange, value]);

	/**
	 *
	 */
	const handleOnChange = React.useCallback((text: string) => {
		setValue(text);
	}, []);

	return (
		<Widget
			label={schema.title || name}
			onBlur={handleOnBlur}
			value={value}
			onChange={handleOnChange}
			options={enumOptions}
			placeholder={placeholder}
			{...options}
		/>
	);
};
