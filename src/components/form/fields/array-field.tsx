import * as React from 'react';
import Text from '../../text';

interface ArrayFieldProps {
	name: string;
}

export const ArrayField = ({ name }: ArrayFieldProps) => {
	return <Text>{name}</Text>;
};
