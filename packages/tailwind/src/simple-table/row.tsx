import * as React from 'react';

import { Box } from '../box';
import { HStack } from '../hstack';
import { Text } from '../text';

interface SimpleTableRowProps {
	columns: import('./types').Column[];
	item: Record<string, any>;
}

/**
 *
 */
const alignItemsMap = {
	left: 'start',
	center: 'center',
	right: 'end',
};

/**
 *
 */
const Row = ({ columns, item }: SimpleTableRowProps) => {
	/**
	 *
	 */
	const defaultCellRenderer = React.useCallback(({ column, item }) => {
		return <Text>{item[column.key]}</Text>;
	}, []);

	/**
	 *
	 */
	return (
		<HStack className="grow border-b">
			{columns.map((column) => {
				const { flex = 1, align = 'left', width, cellRenderer = defaultCellRenderer } = column;

				return (
					<Box
						key={column.key}
						className="p-2 flex-1"
						// padding="small"
						// flex={flex}
						// width={width}
						// align={alignItemsMap[align]}
					>
						{cellRenderer({ column, item })}
					</Box>
				);
			})}
		</HStack>
	);
};

export default Row;
