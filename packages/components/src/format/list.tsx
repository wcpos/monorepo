import * as React from 'react';

import { Text } from '../text';

export interface FormatListProps {
	array?: [];
}

export const FormatList = ({ array }: FormatListProps) => {
	return (
		<>
			{array?.map((item, index) => {
				if (typeof item === 'string') {
					return <Text key={index}>{item}, </Text>;
				}
				return item;
			})}
		</>
	);
};
