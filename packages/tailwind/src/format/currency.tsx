import * as React from 'react';

import { Text } from '../text';

export interface FormatCurrencyProps {
	children: React.ReactNode;
	decimal?: string;
	format?: {
		neg: string;
		pos: string;
		zero: string;
	};
	precision?: number;
	symbol?: string;
	thousand?: string;
}

const FormatCurrency = ({ children, symbol }: FormatCurrencyProps) => {
	return (
		<Text>
			{symbol} {children}
		</Text>
	);
};

export default React.memo(FormatCurrency);
