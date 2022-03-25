import * as React from 'react';
import { getUiOptions, getWidget } from '../../form.helpers';

/**
 *
 */
export function FilesArray<T extends object>({
	schema,
	uiSchema,
	idSchema,
	name,
	disabled,
	readonly,
	autofocus,
	onBlur,
	onFocus,
	registry,
	rawErrors,
	...props
}: import('../../types').FieldProps<T>): React.ReactElement {
	const title = schema.title || name;
	const items = props.formData;
	const { widgets, formContext } = registry;
	const { widget = 'files', ...options } = getUiOptions(uiSchema);
	const Widget = getWidget(schema, widget, widgets);

	const handleSelectChange = React.useCallback(
		(value) => {
			props.onChange(value);
		},
		[props]
	);

	return (
		<Widget
			options={options}
			id={idSchema && idSchema.$id}
			multiple
			onChange={handleSelectChange}
			onBlur={onBlur}
			onFocus={onFocus}
			schema={schema}
			title={title}
			value={items}
			disabled={disabled}
			readonly={readonly}
			formContext={formContext}
			autofocus={autofocus}
			rawErrors={rawErrors}
		/>
	);
}
