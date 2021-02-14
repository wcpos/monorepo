import * as React from 'react';
import * as Styled from './styles';
import Cell from './cell';

type ColumnProps = import('./types').ColumnProps;
type CellProps = import('./cell').Props;

export type Props = {
	children?: React.ReactNode;
	rowData: any;
	columns: ColumnProps[];
	style?: import('react-native').ViewStyle;
};

const Row = ({ rowData, columns, style, children }: Props) => {
	return (
		<Styled.Row style={style}>
			{columns &&
				columns.map((column: ColumnProps, index: number) => {
					if (column.hide) return;
					const dataKey = column.key || index;
					const cellData = rowData[dataKey];
					const { flexGrow, flexShrink, width } = column;

					const getCellProps = (): CellProps => ({
						cellData,
						column,
						dataKey,
						flexGrow,
						flexShrink,
						width,
						rowData,
					});

					if (typeof children === 'function') {
						return children({ cellData, column, getCellProps });
					}

					return <Cell {...getCellProps()} />;
				})}
		</Styled.Row>
	);
};

export default Object.assign(Row, { Cell });
