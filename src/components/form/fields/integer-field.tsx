import * as React from 'react';
import Text from '../../text';

interface IntergerFieldProps {
	name: string;
}

export const IntegerField = ({ name }: IntergerFieldProps) => {
	return <Text>{name}</Text>;
};
