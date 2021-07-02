import * as React from 'react';
import Text from '../text';

export interface FormatNumberProps {
	children: React.ReactNode;
	prefix?: string;
	suffix?: string;
	decimalSeparator?: string;
}

export const FormatNumber = ({ children, prefix, suffix }: FormatNumberProps) => {
	return (
		<Text>
			{prefix} {children} {suffix}
		</Text>
	);
};
