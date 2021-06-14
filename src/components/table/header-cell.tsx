import * as React from 'react';
import { GestureResponderEvent, ViewStyle } from 'react-native';
import * as Styled from './styles';
import Text from '../text';
import Pressable from '../pressable';
import SortIcon from '../sort-icon';

/**
 *
 */
export interface HeaderCellProps {
	children?: React.ReactNode;
	dataKey: string | number;
	defaultSortDirection?: import('./types').SortDirection;
	// headerCellRenderer?: import('./types').HeaderCellRenderer;
	label?: string;
	sort?: import('./types').Sort;
	sortBy?: string;
	sortDirection?: import('./types').SortDirection;
	style?: ViewStyle;
	flexGrow?: 0 | 1;
	flexShrink?: 0 | 1;
	flexBasis?: any;
	width?: string;
	disableSort?: boolean;
	hideLabel?: boolean;
}

/**
 *
 */
const HeaderCell = ({
	children,
	sort,
	sortBy,
	dataKey,
	defaultSortDirection = 'asc',
	sortDirection,
	// headerCellRenderer,
	label,
	style,
	flexGrow = 1,
	flexShrink = 0,
	flexBasis = 'fill',
	width,
	disableSort = false,
	hideLabel = false,
}: HeaderCellProps) => {
	const sortable = !disableSort && typeof sort === 'function';
	const showSortIndicator = sortable && sortBy === dataKey;

	const newSortDirection =
		sortBy !== dataKey ? defaultSortDirection : sortDirection === 'desc' ? 'asc' : 'desc';

	const handlePress = (event: GestureResponderEvent) => {
		if (typeof sort === 'function') {
			sort({
				defaultSortDirection,
				event,
				sortBy: dataKey,
				sortDirection: newSortDirection,
			});
		}
	};

	// if (typeof headerCellRenderer === 'function') {
	// 	return (
	// 		<StyledView flexGrow={flexGrow} flexShrink={flexShrink} width={width}>
	// 			{headerCellRenderer({ dataKey })}
	// 		</StyledView>
	// 	);
	// }

	return (
		<Styled.HeaderCell style={[{ flexGrow, flexShrink, flexBasis, width }, style]}>
			{sortable ? (
				<Pressable onPress={handlePress}>
					{
						// @ts-ignore
						({ hovered }) => (
							<Styled.HeaderTextWrapper>
								<Text>{children || label}</Text>
								<SortIcon
									visible={hovered || showSortIndicator}
									direction={showSortIndicator ? sortDirection : undefined}
								/>
							</Styled.HeaderTextWrapper>
						)
					}
				</Pressable>
			) : (
				!hideLabel && <Text>{children || label}</Text>
			)}
		</Styled.HeaderCell>
	);
};

/**
 * note: statics need to be added after React.memo
 */
const MemoizedHeaderCell = React.memo(HeaderCell);
MemoizedHeaderCell.displayName = 'Table.Header.Row.Cell';

export default MemoizedHeaderCell;
