import * as React from 'react';
import TextInput from '../../textinput';
import Text from '../../text';

interface StringFieldProps {
	name: string;
	formData: string;
}

export const StringField = ({ name, formData }: StringFieldProps) => {
	return <TextInput label={name} value={formData} />;
};
