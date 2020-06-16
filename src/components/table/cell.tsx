import React from 'react';
import * as Styled from './styles';
import Text from '../text';

export type Props = {
	children?: React.ReactNode;
	cellData?: any;
	column?: any;
	// dataKey?: string | number;
	// rowData?: any;
	style?: import('react-native').ViewStyle;
	// rowIndex: number;
	flexGrow?: 0 | 1;
	flexShrink?: 0 | 1;
	width?: string;
};

const Cell: React.FC<Props> = ({ children, cellData, flexGrow, flexShrink, width, style }) => {
	return (
		<Styled.Cell style={style} flexGrow={flexGrow} flexShrink={flexShrink} width={width}>
			{children || <Text>{String(cellData)}</Text>}
		</Styled.Cell>
	);
};

export default Cell;
