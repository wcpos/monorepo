import * as React from 'react';
import { View, ViewStyle } from 'react-native';
import * as Styled from './styles';
import Cell, { TableCellProps } from './cell';

export interface TableRowProps {
	children?: (props: TableCellProps) => React.ReactNode;
	item: any;
	columns: any[];
	style?: ViewStyle;
	translateY: number;
	measureRef: React.Ref<View>;
}

const Row = ({ children, item, columns, style, translateY, measureRef }: TableRowProps) => {
	const renderCell = React.useCallback(
		(column) => {
			const cellProps = {
				key: column.key,
				item,
				cellData: item[column.key],
				column,
			};

			if (typeof children === 'function') {
				return children(cellProps);
			}

			return <Cell {...cellProps} />;
		},
		[children, item]
	);

	return (
		<Styled.Row ref={measureRef} style={[{ transform: [{ translateY }] }, style]}>
			{columns.map(renderCell)}
		</Styled.Row>
	);
};

Row.Cell = Cell;
export default Row;
