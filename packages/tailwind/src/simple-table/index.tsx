import * as React from 'react';

import Header from './header';
import Row from './row';
import { Box } from '../box';
import { VStack } from '../vstack';

interface SimpleTableProps {
	columns: import('./types').Column[];
	data: Record<string, any>[];
}

/**
 *
 */
export const SimpleTable = ({ columns, data }: SimpleTableProps) => {
	return (
		<VStack>
			<Header columns={columns} />
			<VStack>
				{data.map((row, index) => (
					<Row key={row?.primary || index} columns={columns} item={row} />
				))}
			</VStack>
		</VStack>
	);
};
