import * as React from 'react';

import { Text } from '../text';

export interface FormatListProps {
	array?: [];
}

export function FormatList({ array }: FormatListProps) {
	return (
		<>
			{array?.map((item, index) => {
				if (typeof item === 'string') {
					return <Text key={index}>{item}, </Text>;
				}
				return <React.Fragment key={index}>{item}</React.Fragment>;
			})}
		</>
	);
}
