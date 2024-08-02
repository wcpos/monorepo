import * as React from 'react';
import { ViewStyle } from 'react-native';

import { useTable } from './context';
import { Box } from '../box';
import { HStack } from '../hstack';

import type { ListRenderItemInfo } from '@shopify/flash-list';

export interface TableRowProps<T> extends ListRenderItemInfo<T> {
	/**  */
	rowStyle?: ViewStyle;

	/**  */
	cellStyle?: ViewStyle;

	/**  */
	extraData: import('./').TableExtraDataProps<T>;

	/**  */
	cellRenderer?: import('./').CellRenderer<T>;
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
 * TODO - Use a TableContext to pass down data, it's more flexible to add new props
 */
const TableRow = <T extends object>({
	item,
	rowStyle,
	cellStyle,
	index,
	...props
}: TableRowProps<T>) => {
	const context = useTable();
	const { columns } = context;
	const cellRenderer = props.cellRenderer || context.cellRenderer;
	const [cellWidths, setCellWidths] = React.useState({});

	/**
	 *
	 */
	const onLayout = React.useCallback((event, columnKey) => {
		const { width } = event.nativeEvent.layout;
		setCellWidths((prevWidths) => {
			return { ...prevWidths, [columnKey]: width };
		});
	}, []);

	/**
	 *
	 */
	const renderCell = React.useCallback(
		(column, idx) => {
			const { flex = 1, align = 'left', width } = column;

			return (
				<Box
					key={column.key}
					className={`p-2 justify-${alignItemsMap[align]}`}
					style={[{ flex: width ? `0 0 ${width}px` : flex }, cellStyle]}
					onLayout={(event) => onLayout(event, column.key)}
				>
					{cellRenderer({ item, column, index: idx, cellWidth: cellWidths[column.key] })}
				</Box>
			);
		},
		[cellRenderer, cellStyle, cellWidths, item, onLayout]
	);

	/**
	 *
	 */
	return (
		<HStack className="gap-0" style={rowStyle} alt={index % 2 !== 0}>
			{columns.map(renderCell)}
		</HStack>
	);
};

export default React.memo(TableRow);
