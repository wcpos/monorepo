import React from 'react';
import * as Styled from './styles';
import Text from '../text';

export type Props = {
	children?: React.ReactNode;
	cellData: any;
	// cellRenderer?: import('./types').CellRenderer;
	columnData: any;
	dataKey?: string | number;
	rowData?: any;
	style?: import('react-native').ViewStyle;
	// rowIndex: number;
	flexGrow?: 0 | 1;
	flexShrink?: 0 | 1;
	width?: string;
};

const Cell: React.FC<Props> = ({
	children,
	// cellRenderer,
	cellData,
	dataKey,
	rowData,
	// style,
	flexGrow,
	flexShrink,
	width,
	style,
}) => {
	// const cell =
	// 	typeof cellRenderer === 'function'
	// 		? cellRenderer({ cellData, dataKey, rowData })
	// 		: cellData == null
	// 		? ''
	// 		: String(cellData);

	return (
		<Styled.Cell style={style} flexGrow={flexGrow} flexShrink={flexShrink} width={width}>
			<Text>{children || String(cellData)}</Text>
		</Styled.Cell>
	);
};

export default Cell;
