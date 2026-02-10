import * as React from 'react';

import { Text } from '../text';

export interface FormatNameProps {
	firstName?: string;
	lastName?: string;
}

export function FormatName({ firstName, lastName }: FormatNameProps) {
	return (
		<Text>
			{firstName} {lastName}
		</Text>
	);
}
