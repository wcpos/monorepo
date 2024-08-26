import * as React from 'react';

import { Text } from '../text';

export interface FormatNameProps {
	firstName?: string;
	lastName?: string;
}

export const FormatName = ({ firstName, lastName }: FormatNameProps) => {
	return (
		<Text>
			{firstName} {lastName}
		</Text>
	);
};
