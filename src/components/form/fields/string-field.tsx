import * as React from 'react';
import TextInput from '../../textinput';
import Text from '../../text';

/**
 *
 */
export function StringField<T extends object>({
	schema,
	uiSchema,
	idSchema,
	idPrefix,
	formContext,
	formData,
	registry,
	name,
	onChange,
}: import('../types').FieldProps<T>): React.ReactElement {
	const handleTextChange = React.useCallback(
		(value: string) => {
			if (onChange) {
				onChange({ [name]: value });
			}
		},
		[name, onChange]
	);

	return <TextInput label={name} value={formData} onChange={handleTextChange} />;
}
