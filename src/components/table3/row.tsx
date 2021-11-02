import * as React from 'react';
import { ViewStyle } from 'react-native';
import Text from '../text';
import * as Styled from './styles';

/**
 *
 */
export const renderCell: <T>(
	item: T,
	column: import('./table').ColumnProps<T>,
	index: number
) => React.ReactNode = (item, column, index) => {
	return column.onRender ? (
		column.onRender(item, column, index)
	) : (
		<Text>{String(item[column.key] ?? '')}</Text>
	);
};

export interface TableRowProps<T> {
	item: T;
	columns: import('./table').ColumnProps<T>[];
	rowStyle?: ViewStyle;
	cellStyle?: ViewStyle;
}

/**
 *
 */
export const TableRow = React.memo(function TableRow<T>({
	item,
	columns,
	rowStyle,
	cellStyle,
}: TableRowProps<T>) {
	return (
		<Styled.Row style={rowStyle}>
			{columns.map((column, index) => {
				const cell = renderCell(item, column, index);
				const { flexGrow = 1, flexShrink = 1, flexBasis = 'auto', width = '100%' } = column;
				return (
					<Styled.Cell
						key={column.key}
						style={[{ flexGrow, flexShrink, flexBasis, width }, cellStyle]}
					>
						{cell}
					</Styled.Cell>
				);
			})}
		</Styled.Row>
	);
});

// export default React.memo(TableRow);
