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

function FormatCurrency({ children, symbol }: FormatCurrencyProps) {
	return (
		<Text>
			{symbol} {children}
		</Text>
	);
}

const MemoizedFormatCurrency = React.memo(FormatCurrency);
export { MemoizedFormatCurrency as FormatCurrency };
