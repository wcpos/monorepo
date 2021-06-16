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

const Row = ({ rowData, columns = [], style, children }: TableRowProps) => {
	return (
		<Styled.Row style={style}>
			{columns &&
				columns.map((column: ColumnProps, index: number) => {
					if (column.hide) return;
					const dataKey = column.key || index;
					const cellData = rowData[dataKey];

					return <Cell dataKey={dataKey} cellData={cellData} />;
				})}
		</Styled.Row>
	);
};

export default Row;
