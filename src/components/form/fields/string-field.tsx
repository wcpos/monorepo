import * as React from 'react';
import TextInput from '../../textinput';
import Text from '../../text';

interface StringFieldProps {
	name: any;
}

export const StringField = ({ name }: StringFieldProps) => {
	return <TextInput label={name} />;
};
