import * as React from 'react';
import TextInput from '../../textinput';
import Text from '../../text';

interface StringFieldProps {
	name: string;
	formData: string;
	onChange: any;
}

export const StringField = ({ name, formData, onChange }: StringFieldProps) => {
	const handleTextChange = React.useCallback(
		(value: string) => {
			if (onChange) {
				onChange({ [name]: value });
			}
		},
		[name, onChange]
	);

	return <TextInput label={name} value={formData} onChange={handleTextChange} />;
};
