import * as React from 'react';
import { getUiOptions, getWidget, optionsList, retrieveSchema } from '../../form.helpers';

/**
 *
 */
export function MultiSelect<T extends object>({
	schema,
	idSchema,
	uiSchema,
	formData,
	disabled,
	readonly,
	required,
	placeholder,
	autofocus,
	onBlur,
	onFocus,
	registry,
	rawErrors,
	name,
	...props
}: import('../../types').FieldProps<T>) {
	const title = schema.title || name;
	const items = props.formData;
	const { widgets, formContext, rootSchema } = registry;
	const itemsSchema = retrieveSchema(schema.items, rootSchema, formData);
	const enumOptions = optionsList(itemsSchema);
	const { widget = 'select', ...options } = {
		...getUiOptions(uiSchema),
		enumOptions,
	};
	const Widget = getWidget(schema, widget, widgets);

	const handleSelectChange = React.useCallback(
		(value) => {
			props.onChange(value);
		},
		[props]
	);

	return (
		<Widget
			id={idSchema && idSchema.$id}
			multiple
			onChange={handleSelectChange}
			onBlur={onBlur}
			onFocus={onFocus}
			options={options}
			schema={schema}
			registry={registry}
			value={items}
			disabled={disabled}
			readonly={readonly}
			required={required}
			label={title}
			placeholder={placeholder}
			formContext={formContext}
			autofocus={autofocus}
			rawErrors={rawErrors}
		/>
	);
}
