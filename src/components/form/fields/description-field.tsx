import * as React from 'react';
import Text from '../../text';
import Box from '../../box';

const REQUIRED_FIELD_SYMBOL = '*';

interface DescriptionFieldProps {
	id: string;
	title: string;
	required: boolean;
}

export const DescriptionField = ({ id, title, required }: DescriptionFieldProps) => {
	return (
		<Box horizontal>
			<Text>{title}</Text> {required && <Text>{REQUIRED_FIELD_SYMBOL}</Text>}
		</Box>
	);
};
