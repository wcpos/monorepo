import * as React from 'react';

import { Box } from '../box';
import { HStack } from '../hstack';
import { Text } from '../text';

interface SimpleTableHeaderProps {
	columns: import('./types').Column[];
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
const Header = ({ columns }: SimpleTableHeaderProps) => {
	return (
		<HStack className="border-b bg-gray-300">
			{columns.map((column) => {
				const { flex = 1, align = 'left', width } = column;

				return (
					<Box
						key={column.key}
						className="p-2 flex-1"
						// padding="small"
						// flex={flex}
						// width={width}
						// align={alignItemsMap[align]}
					>
						<Text className="text-sm text-secondary uppercase" numberOfLines={1}>
							{column.label}
						</Text>
					</Box>
				);
			})}
		</HStack>
	);
};

export default Header;
