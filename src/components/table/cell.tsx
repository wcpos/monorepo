import React from 'react';
import { Cell as StyledView } from './styles';
import { CellRenderer } from './';
import Text from '../text';

type Props = {
	cellData: any;
	cellRenderer?: CellRenderer;
	columnData: any;
	dataKey: string | number;
	rowData: any;
	// style?: any;
	// rowIndex: number;
	flexGrow?: 0 | 1;
	flexShrink?: 0 | 1;
	width?: string;
};

const Cell = ({
	cellRenderer,
	cellData,
	dataKey,
	rowData,
	// style,
	flexGrow,
	flexShrink,
	width,
}: Props) => {
	const cell =
		typeof cellRenderer === 'function'
			? cellRenderer({ cellData, dataKey, rowData })
			: cellData == null
				? ''
			: String(cellData);

	return (
		<StyledView flexGrow={flexGrow} flexShrink={flexShrink} width={width}>
			{typeof cell === 'string' ? <Text>{cell}</Text> : cell}
		</StyledView>
	);
};

export default Cell;
