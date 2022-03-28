import * as React from 'react';
import Text from '../../text';
import Box from '../../box';

interface DescriptionFieldProps {
	id: string;
	description: string;
}

export const DescriptionField = ({ id, description }: DescriptionFieldProps) => {
	return (
		<Box>
			<Text>{description}</Text>
		</Box>
	);
};
