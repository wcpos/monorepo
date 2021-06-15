import * as React from 'react';
import { ViewStyle } from 'react-native';
import * as Styled from './styles';
import Cell, { TableCellProps } from './cell';

type ColumnProps = import('./types').ColumnProps;
export type GetCellPropsFunction = () => TableCellProps;

export interface TableRowProps {
	children?: React.ReactNode;
	rowData: any;
	columns?: ColumnProps[];
	style?: ViewStyle;
}

const Row = ({ rowData, columns, style, children }: TableRowProps) => {
	// const key = rowData.id;
	// const renderCells = React.memo(() => {

	// }, [columns])

	return (
		<Styled.Row style={style}>
			{columns &&
				columns.map((column: ColumnProps, index: number) => {
					if (column.hide) return;
					const dataKey = column.key || index;
					const cellData = rowData[dataKey];
					const { flexGrow, flexShrink, flexBasis, width } = column;

					const getCellProps: GetCellPropsFunction = () => ({
						cellData,
						column,
						dataKey,
						flexGrow,
						flexShrink,
						flexBasis,
						width,
						rowData,
						index,
						key: dataKey,
					});

					if (typeof children === 'function') {
						return children({ cellData, column, getCellProps });
					}

					return <Cell {...getCellProps()} />;
				})}
		</Styled.Row>
	);
};

/**
 * note: statics need to be added after React.memo
 */
const MemoizedRow = React.memo(Row) as unknown as React.FC<TableRowProps> & { Cell: typeof Cell };
MemoizedRow.displayName = 'Table.Row';
MemoizedRow.Cell = Cell;

export default MemoizedRow;
