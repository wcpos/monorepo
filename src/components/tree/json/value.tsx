import * as React from 'react';
import Text from '../../text';

export interface JsonValueProps {
	name: string;
	value: any;
	originalValue: any;
}

export const JsonValue = ({ name, value }: JsonValueProps) => {
	return (
		<Text>
			{name} : {String(value)}
		</Text>
	);
};
