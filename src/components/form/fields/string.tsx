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
	const { registry, onChange, formContext } = useFormContext();
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
	const handleOnChange = React.useCallback(
		(val: any) => {
			if (widget === 'select') {
				onChange({ [idSchema.$id]: val.value });
			} else {
				setValue(val);
			}
		},
		[idSchema.$id, onChange, widget]
	);

	/**
	 *
	 */
	const label = React.useMemo(() => {
		const _label = schema.title || name;
		if (formContext && formContext.label && typeof formContext.label === 'function') {
			return formContext.label(idSchema.$id, _label);
		}
		return _label;
	}, [formContext, idSchema.$id, name, schema.title]);

	return (
		<Widget
			label={label}
			onBlur={handleOnBlur}
			value={value}
			onChange={handleOnChange}
			options={enumOptions}
			placeholder={placeholder}
			{...options}
		/>
	);
};
