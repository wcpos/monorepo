import * as React from 'react';
import get from 'lodash/get';
import { useFormContext } from '../context';
import { isSelect, optionsList, getUiOptions } from '../form.helpers';
import { getWidget } from '../widgets';

interface BooleanFieldProps {
	schema: import('../types').Schema;
	formData: any;
	name: string;
}

export const BooleanField = ({ schema, formData, name, idSchema, uiSchema }: BooleanFieldProps) => {
	const { registry, onChange } = useFormContext();
	const { widget = 'checkbox', ...options } = getUiOptions(uiSchema);
	const Widget = getWidget(schema, widget, registry.widgets);

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

	/**
	 *
	 */
	const handleOnChange = React.useCallback(
		(value: boolean) => {
			if (onChange) {
				onChange({ [idSchema.$id]: value });
			}
		},
		[idSchema.$id, onChange]
	);

	return (
		<Widget
			label={schema.title}
			value={formData}
			onChange={handleOnChange}
			options={{ ...options, enumOptions }}
		/>
	);
};
