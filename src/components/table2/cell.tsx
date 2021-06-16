import * as React from 'react';
import { ViewStyle } from 'react-native';
import * as Styled from './styles';
import Text from '../text';

export interface TableCellProps {
	children?: React.ReactNode;
	cellData?: any;
	column?: any;
	dataKey?: string | number;
	rowData?: any;
	style?: ViewStyle;
	// rowIndex: number;
	flexGrow?: 0 | 1;
	flexShrink?: 0 | 1;
	flexBasis?: any;
	width?: string;
	index?: number;
}

const Cell = ({ dataKey, cellData }) => {
	return (
		<Styled.Cell>
			<Text>{String(cellData ?? '')}</Text>
		</Styled.Cell>
	);
};

export default Cell;
