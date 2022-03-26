import * as React from 'react';
import { getWidget, getUiOptions, optionsList, getDefaultRegistry } from '../form.helpers';

/**
 *
 */
export function BooleanField<T extends object>({
	schema,
	name,
	uiSchema,
	idSchema,
	formData,
	registry = getDefaultRegistry(),
	required,
	disabled,
	readonly,
	autofocus,
	onChange,
	onFocus,
	onBlur,
	rawErrors,
}: import('../types').FieldProps<T>): React.ReactElement {
	const { title } = schema;
	const { widgets, formContext, fields } = registry;
	const { widget = 'checkbox', ...options } = getUiOptions(uiSchema);
	const Widget = getWidget(schema, widget, widgets);

	let enumOptions;

	if (Array.isArray(schema.oneOf)) {
		enumOptions = optionsList({
			oneOf: schema.oneOf.map((option) => ({
				...option,
				title: option.title || (option.const === true ? 'Yes' : 'No'),
			})),
		});
	} else {
		enumOptions = optionsList({
			enum: schema.enum || [true, false],
			enumNames:
				schema.enumNames ||
				(schema.enum && schema.enum[0] === false ? ['No', 'Yes'] : ['Yes', 'No']),
		});
	}

	return (
		<Widget
			options={{ ...options, enumOptions }}
			schema={schema}
			uiSchema={uiSchema}
			id={idSchema && idSchema.$id}
			onChange={onChange}
			onFocus={onFocus}
			onBlur={onBlur}
			label={title === undefined ? name : title}
			value={formData}
			required={required}
			disabled={disabled}
			readonly={readonly}
			registry={registry}
			formContext={formContext}
			autofocus={autofocus}
			rawErrors={rawErrors}
			DescriptionField={fields.DescriptionField}
		/>
	);
}
