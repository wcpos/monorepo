import * as React from 'react';
import Text from '../../text';
import Box from '../../box';

interface DescriptionFieldProps {
	description: string;
}

export const DescriptionField = ({ description }: DescriptionFieldProps) => {
	return (
		<Box>
			<Text>{description}</Text>
		</Box>
	);
};
