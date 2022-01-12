import * as React from 'react';
import Text from '../../text';

interface BooleanFieldProps {
	name: string;
}

export const BooleanField = ({ name }: BooleanFieldProps) => {
	return <Text>{name}</Text>;
};
