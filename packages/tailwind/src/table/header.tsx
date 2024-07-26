import * as React from 'react';
import { GestureResponderEvent } from 'react-native';

import { useTable } from './context';
import { Box } from '../box';
import { Button } from '../button';
import { HStack } from '../hstack';
import { SortIcon } from '../sort-icon';
import { Text } from '../text';
// import { useTableContext } from './context';

/**
 * Map column align (left, right, center) to box align prop (start, end, center)
 */
const alignItemsMap = {
	left: 'start',
	center: 'center',
	right: 'end',
};

/**
 * TODO: set cell width here, so we only have to measure once - needs TableContext
 */
const TableHeader = () => {
	const { columns, sort, sortBy, sortDirection, headerLabel } = useTable();

	/**
	 *
	 */
	const renderHeaderCell = React.useCallback(
		(column) => {
			const {
				key,
				flex = 1,
				width,
				disableSort = false,
				defaultSortDirection = 'asc',
				hideLabel = false,
				label,
				align = 'left',
			} = column;
			const sortable = !disableSort && typeof sort === 'function';
			const showSortIndicator = sortable && sortBy === key;
			const newSortDirection =
				sortBy !== key ? defaultSortDirection : sortDirection === 'desc' ? 'asc' : 'desc';

			const handlePress = (event: GestureResponderEvent) => {
				if (sortable) {
					sort({
						defaultSortDirection,
						event,
						sortBy: key,
						sortDirection: newSortDirection,
					});
				}
			};

			return (
				<Box
					key={key}
					className="p-2 flex-1"
					//flex={flex} width={width} align={alignItemsMap[align]}
				>
					{sortable ? (
						<Button variant="ghost" className="p-0 h-3.5" onPress={handlePress}>
							{({ hovered }: any) => (
								<HStack space="xs" className={`justify-${alignItemsMap[align]}`}>
									<Text className="text-xs text-muted-foreground uppercase" numberOfLines={1}>
										{headerLabel({ column })}
									</Text>
									{(showSortIndicator || hovered) && (
										<SortIcon
											hovered={hovered}
											direction={showSortIndicator ? sortDirection : undefined}
										/>
									)}
								</HStack>
							)}
						</Button>
					) : (
						!hideLabel && (
							<Text className="text-xs text-muted-foreground uppercase" numberOfLines={1}>
								{headerLabel({ column })}
							</Text>
						)
					)}
				</Box>
			);
		},
		[headerLabel, sort, sortBy, sortDirection]
	);

	/**
	 *
	 */
	return <HStack className="gap-0 border-b bg-muted">{columns.map(renderHeaderCell)}</HStack>;
};

export default TableHeader;
