import * as React from 'react';
import { getUiOptions, getWidget, getDefaultRegistry } from '../../form.helpers';

/**
 *
 */
export function CustomWidget<T extends object>({
	schema,
	idSchema,
	uiSchema,
	disabled,
	readonly,
	hideError,
	required,
	placeholder,
	autofocus,
	onBlur,
	onFocus,
	formData: items,
	registry = getDefaultRegistry(),
	rawErrors,
	name,
	...props
}: import('../../types').FieldProps<T>) {
	const { widgets, formContext } = registry;
	const title = schema.title || name;

	const { widget, ...options } = {
		...getUiOptions(uiSchema),
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
			hideError={hideError}
			required={required}
			label={title}
			placeholder={placeholder}
			formContext={formContext}
			autofocus={autofocus}
			rawErrors={rawErrors}
		/>
	);
}
