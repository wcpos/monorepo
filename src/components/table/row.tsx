import React from 'react';
import { Row as StyledView } from './styles';
import Cell from './cell';
import { ColumnProps } from './';

type Props = {
	rowData: any;
	columns: ColumnProps[];
};

const Row = ({ rowData, columns }: Props) => {
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
					cellRenderer={cellRenderer}
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

	return <StyledView>{columns.map(mapper)}</StyledView>;
};

export default Row;
