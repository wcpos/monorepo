import * as React from 'react';
import { GestureResponderEvent } from 'react-native';

import { useTable } from './context';
import * as Styled from './styles';
import Box from '../box';
import Pressable from '../pressable';
import SortIcon from '../sort-icon';
import Text from '../text';
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
				<Styled.HeaderCell
					key={key}
					padding="small"
					flex={flex}
					width={width}
					align={alignItemsMap[align]}
				>
					{sortable ? (
						<Pressable onPress={handlePress} style={{ width: '100%', flexDirection: 'column' }}>
							{({ hovered }: any) => (
								<Box horizontal space="xxSmall" align="center" distribution={alignItemsMap[align]}>
									<Text uppercase size="small" numberOfLines={1} type="textMuted">
										{headerLabel({ column })}
									</Text>
									{(showSortIndicator || hovered) && (
										<SortIcon
											hovered={hovered}
											direction={showSortIndicator ? sortDirection : undefined}
										/>
									)}
								</Box>
							)}
						</Pressable>
					) : (
						!hideLabel && (
							<Text uppercase size="small" numberOfLines={1} type="textMuted">
								{headerLabel({ column })}
							</Text>
						)
					)}
				</Styled.HeaderCell>
			);
		},
		[headerLabel, sort, sortBy, sortDirection]
	);

	/**
	 *
	 */
	return (
		<Styled.HeaderRow horizontal align="center">
			{columns.map(renderHeaderCell)}
		</Styled.HeaderRow>
	);
};

export default TableHeader;
