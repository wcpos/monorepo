import * as React from 'react';
import * as Styled from './styles';
import { Cell } from './cell';

type ColumnProps = import('./types').ColumnProps;
type ITableCellProps = import('./cell').ITableCellProps;
export type GetCellPropsFunction = () => ITableCellProps;

export interface ITableRowProps {
	children?: React.ReactNode;
	rowData: any;
	columns?: ColumnProps[];
	style?: import('react-native').ViewStyle;
}

type IsFunction<T> = T extends (...args: any[]) => any ? T : never;
const isFunction = <T extends {}>(value: T): value is IsFunction<T> => typeof value === 'function';

export const Row = ({ rowData, columns, style, children }: ITableRowProps) => {
	// const key = rowData.id;

	return (
		<Styled.Row>
			{columns &&
				columns.map((column: ColumnProps, index: number) => {
					if (column.hide) return;
					const dataKey = column.key || index;
					const cellData = rowData[dataKey];
					const { flexGrow, flexShrink, width } = column;

					const getCellProps: GetCellPropsFunction = () => ({
						cellData,
						column,
						dataKey,
						flexGrow,
						flexShrink,
						width,
						rowData,
						index,
						key: dataKey,
					});

					if (children && isFunction(children)) {
						// @ts-ignore
						return children({ cellData, column, getCellProps });
					}

					return <Cell {...getCellProps()} />;
				})}
		</Styled.Row>
	);
};

Row.Cell = Cell;
Row.displayName = 'Table.Row';
