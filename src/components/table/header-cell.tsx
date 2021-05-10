import * as React from 'react';
import { View, GestureResponderEvent } from 'react-native';
import * as Styled from './styles';
import Text from '../text';
import Pressable from '../pressable';
import SortIcon from '../sort-icon';

export interface IHeaderCellProps {
	children?: React.ReactNode;
	dataKey: string | number;
	defaultSortDirection?: import('./types').SortDirection;
	// headerCellRenderer?: import('./types').HeaderCellRenderer;
	label?: string;
	sort?: import('./types').Sort;
	sortBy?: string;
	sortDirection?: import('./types').SortDirection;
	// style?: any;
	flexGrow?: 0 | 1;
	flexShrink?: 0 | 1;
	width?: string;
}

export const HeaderCell = ({
	children,
	sort,
	sortBy,
	dataKey,
	defaultSortDirection = 'asc',
	sortDirection,
	// headerCellRenderer,
	label,
	// style,
	flexGrow,
	flexShrink,
	width,
}: IHeaderCellProps) => {
	const sortable = typeof sort === 'function';
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
		<Styled.HeaderCell flexGrow={flexGrow} flexShrink={flexShrink} width={width}>
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
				<Text>{children || label}</Text>
			)}
		</Styled.HeaderCell>
	);
};

HeaderCell.displayName = 'Table.Header.Cell';
