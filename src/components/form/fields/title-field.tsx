import * as React from 'react';
import Text from '../../text';
import Box from '../../box';

const REQUIRED_FIELD_SYMBOL = '*';

interface TitleFieldProps {
	id: string;
	title: string;
	required: boolean;
}

export const TitleField = ({ id, title, required }: TitleFieldProps) => {
	return (
		<Box horizontal>
			<Text>{title}</Text> {required && <Text>{REQUIRED_FIELD_SYMBOL}</Text>}
		</Box>
	);
};
