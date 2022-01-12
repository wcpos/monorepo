import * as React from 'react';
import Text from '../../text';

interface NumberFieldProps {
	name: string;
}

export const NumberField = ({ name }: NumberFieldProps) => {
	return <Text>{name}</Text>;
};
