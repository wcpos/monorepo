import * as React from 'react';
import TextInput from '../../textinput';
import {
	getWidget,
	getUiOptions,
	isSelect,
	optionsList,
	getDefaultRegistry,
	hasWidget,
} from '../form.helpers';

/**
 *
 */
export function StringField<T extends object>({
	schema,
	name,
	uiSchema,
	idSchema,
	formData,
	required,
	disabled,
	readonly,
	autofocus,
	onChange,
	onBlur,
	onFocus,
	registry,
	rawErrors,
}: import('../types').FieldProps<T>): React.ReactElement {
	const { title, format } = schema;
	const { widgets, formContext } = registry;
	const enumOptions = isSelect(schema) && optionsList(schema);
	let defaultWidget = enumOptions ? 'select' : 'text';

	if (format && hasWidget(schema, format, widgets)) {
		defaultWidget = format;
	}

	const { widget = defaultWidget, placeholder = '', ...options } = getUiOptions(uiSchema);
	const Widget = getWidget(schema, widget, widgets);

	const handleTextChange = React.useCallback(
		(value: string) => {
			if (onChange) {
				onChange({ [name]: value });
			}
		},
		[name, onChange]
	);

	// return <TextInput label={name} value={formData} onChange={handleTextChange} />;
	return (
		<Widget
			options={{ ...options, enumOptions }}
			schema={schema}
			uiSchema={uiSchema}
			id={idSchema && idSchema.$id}
			label={title === undefined ? name : title}
			value={formData}
			onChange={onChange}
			onBlur={onBlur}
			onFocus={onFocus}
			required={required}
			disabled={disabled}
			readonly={readonly}
			formContext={formContext}
			autofocus={autofocus}
			registry={registry}
			placeholder={placeholder}
			rawErrors={rawErrors}
		/>
	);
}
