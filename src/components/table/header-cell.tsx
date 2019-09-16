import React from 'react';
import { View, GestureResponderEvent } from 'react-native';
import { HeaderCell as StyledView } from './styles';
import Text from '../text';
import Icon from '../icon';
import Touchable from '../touchable';
import { Sort, SortDirection } from './';

type Props = {
	dataKey: string | number;
	defaultSortDirection?: SortDirection;
	headerCellRenderer?: import('./').HeaderCellRenderer;
	label: string;
	sort?: Sort;
	sortBy?: string;
	sortDirection?: SortDirection;
	// style?: any;
	flexGrow?: 0 | 1;
	flexShrink?: 0 | 1;
	width?: string;
};

const Cell = ({
	sort,
	sortBy,
	dataKey,
	defaultSortDirection = 'asc',
	sortDirection,
	headerCellRenderer,
	label,
	// style,
	flexGrow,
	flexShrink,
	width,
}: Props) => {
	const sortable = typeof sort === 'function';
	const showSortIndicator = sortable && sortBy === dataKey;

	const newSortDirection =
		sortBy !== dataKey ? defaultSortDirection : sortDirection === 'desc' ? 'asc' : 'desc';

	const onPress = (event: GestureResponderEvent) => {
		if (typeof sort === 'function') {
			sort({
				defaultSortDirection,
				event,
				sortBy: dataKey,
				sortDirection: newSortDirection,
			});
		}
	};

	if (typeof headerCellRenderer === 'function') {
		return (
			<StyledView flexGrow={flexGrow} flexShrink={flexShrink} width={width}>
				{headerCellRenderer({ dataKey })}
			</StyledView>
		);
	}

	return (
		<StyledView flexGrow={flexGrow} flexShrink={flexShrink} width={width}>
			{sortable ? (
				<Touchable onPress={onPress}>
					<View>
						<Text>{label}</Text>
						{showSortIndicator && (
							<Icon name={'angle-' + (sortDirection === 'asc' ? 'up' : 'down')} />
						)}
					</View>
				</Touchable>
			) : (
				<Text>{label}</Text>
			)}
		</StyledView>
	);
};

export default Cell;
