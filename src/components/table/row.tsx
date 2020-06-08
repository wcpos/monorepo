import React from 'react';
import * as Styled from './styles';
import Cell from './cell';

type ColumnProps = import('./types').ColumnProps;

export type Props = {
	children?: React.ReactNode;
	rowData: any;
	columns: ColumnProps[];
	styles?: import('react-native').ViewStyle;
};

const Row: React.FC<Props> = ({ rowData, columns, style, children }) => {
	const mapper = (column: ColumnProps, index: number) => {
		const dataKey = column.key || index;

		const cellData =
			typeof column.cellDataGetter === 'function'
				? column.cellDataGetter({ rowData, dataKey, column })
				: rowData[dataKey];

		const { flexGrow, flexShrink, width, cellRenderer } = column;

		return (
			!column.hide && (
				<Cell
					cellData={cellData}
					// cellRenderer={children || cellRenderer}
					columnData={column}
					dataKey={dataKey}
					key={dataKey || index}
					rowData={rowData}
					flexGrow={flexGrow}
					flexShrink={flexShrink}
					width={width}
				/>
			)
		);
	};

	return <Styled.Row style={style}>{columns && columns.map(mapper)}</Styled.Row>;
};

export default Object.assign(Row, { Cell });
