import React, { Fragment, ReactNode } from 'react';
import Text from '../text';

interface Props {
	children: ReactNode;
	prefix?: string;
	suffix?: string;
	decimalSeparator?: string;
}

const Name = ({ children, prefix, suffix }: Props) => {
	return (
		<Text>
			{prefix} {children} {suffix}
		</Text>
	);
};

export default Name;
