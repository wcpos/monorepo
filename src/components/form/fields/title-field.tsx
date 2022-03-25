import * as React from 'react';
import Text from '../../text';
import Box from '../../box';

interface TitleFieldProps {
	id: string;
	description: string;
}

export const TitleField = ({ id, description }: TitleFieldProps) => {
	return (
		<Box horizontal>
			<Text>{description}</Text>
		</Box>
	);
};
