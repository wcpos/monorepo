import * as React from 'react';
import { ViewStyle } from 'react-native';
import { isRxDocument } from 'rxdb/plugins/core';
import { useObservableState } from 'observable-hooks';
import Text from '../text';
import Box from '../box';

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
	cellRenderer?: (
		item: T,
		column: import('./table').ColumnProps<T>,
		index: number
	) => React.ReactNode;
}

/**
 *
 */
export const TableRow = React.memo(function TableRow<T>({
	item,
	columns,
	rowStyle,
	cellStyle,
	cellRenderer,
}: TableRowProps<T>) {
	return (
		<Box horizontal align="center" style={rowStyle}>
			{columns.map((column, index) => {
				const { flexGrow = 1, flexShrink = 1, flexBasis = 'auto', width = '100%' } = column;
				return (
					<Box
						key={column.key}
						padding="small"
						style={[{ flexGrow, flexShrink, flexBasis, width }, cellStyle]}
					>
						{typeof cellRenderer === 'function' ? (
							cellRenderer(item, column, index)
						) : (
							<Text>{String(item[column.key] ?? '')}</Text>
						)}
					</Box>
				);
			})}
		</Box>
	);
});

// @TODO - can't add generic type to React.memo?
// export default React.memo(TableRow);
