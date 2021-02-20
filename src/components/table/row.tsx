import * as React from 'react';
import * as Styled from './styles';
import Cell from './cell';

type ColumnProps = import('./types').ColumnProps;
type CellProps = import('./cell').Props;
export type GetCellPropsFunction = () => CellProps;

export interface ITableRowProps {
	children?: React.ReactNode;
	rowData: any;
	columns: ColumnProps[];
	style?: import('react-native').ViewStyle;
}

type IsFunction<T> = T extends (...args: any[]) => any ? T : never;
const isFunction = <T extends {}>(value: T): value is IsFunction<T> => typeof value === 'function';

const Row = ({ rowData, columns, style, children }: ITableRowProps) => {
	return (
		<Styled.Row style={style}>
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

export default Object.assign(Row, { Cell });
