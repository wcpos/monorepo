import * as React from 'react';
import { GestureResponderEvent, ViewStyle } from 'react-native';
import * as Styled from './styles';
import Text from '../text';
import Pressable from '../pressable';
import SortIcon from '../sort-icon';

export interface TableHeaderProps<T> {
	columns: import('./table').ColumnProps<T>[];
	style?: ViewStyle;
	sort?: import('./table').Sort;
	sortBy?: keyof T & string;
	sortDirection?: import('./table').SortDirection;
}

const TableHeader: <T>(props: TableHeaderProps<T>) => React.ReactElement = ({
	columns,
	style,
	sort,
	sortBy,
	sortDirection,
}) => {
	return (
		<Styled.HeaderRow>
			{columns.map((column) => {
				const {
					key,
					flexGrow = 1,
					flexShrink = 1,
					flexBasis = 'auto',
					width = '100%',
					disableSort = false,
					defaultSortDirection = 'asc',
					hideLabel = false,
					label,
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
					<Styled.HeaderCell key={key} style={[{ flexGrow, flexShrink, flexBasis, width }, style]}>
						{sortable ? (
							<Pressable onPress={handlePress}>
								{({ hovered }: any) => (
									<Styled.HeaderTextWrapper>
										<Text>{label}</Text>
										<SortIcon
											visible={hovered || showSortIndicator}
											direction={showSortIndicator ? sortDirection : undefined}
										/>
									</Styled.HeaderTextWrapper>
								)}
							</Pressable>
						) : (
							!hideLabel && <Text>{label}</Text>
						)}
					</Styled.HeaderCell>
				);
			})}
		</Styled.HeaderRow>
	);
};

export default React.memo(TableHeader) as typeof TableHeader;
