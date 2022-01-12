import * as React from 'react';
import Text from '../../text';

interface NullFieldProps {
	name: string;
}

export const NullField = ({ name }: NullFieldProps) => {
	return <Text>{name}</Text>;
};
