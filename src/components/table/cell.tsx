import * as React from 'react';
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
	if (children) {
		return (
			<Styled.Cell style={style} flexGrow={flexGrow} flexShrink={flexShrink} width={width}>
				{typeof children === 'function' ? children({ cellData }) : children}
			</Styled.Cell>
		);
	}

	return (
		<Styled.Cell style={style} flexGrow={flexGrow} flexShrink={flexShrink} width={width}>
			<Text>{String(cellData)}</Text>
		</Styled.Cell>
	);
};

export default Cell;
