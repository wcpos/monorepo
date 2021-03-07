import * as React from 'react';
import * as Styled from './styles';
import Text from '../text';

export interface ITableCellProps {
	children?: React.ReactNode;
	cellData?: any;
	column?: any;
	dataKey?: string | number;
	rowData?: any;
	style?: import('react-native').ViewStyle;
	// rowIndex: number;
	flexGrow?: 0 | 1;
	flexShrink?: 0 | 1;
	width?: string;
	index?: number;
}

export const Cell = ({
	children,
	cellData,
	flexGrow,
	flexShrink,
	width,
	style,
	rowData,
	dataKey,
}: ITableCellProps) => {
	if (children) {
		return (
			<Styled.Cell flexGrow={flexGrow} flexShrink={flexShrink} width={width}>
				{typeof children === 'function' ? children({ cellData }) : children}
			</Styled.Cell>
		);
	}

	return (
		<Styled.Cell flexGrow={flexGrow} flexShrink={flexShrink} width={width}>
			<Text>{String(cellData)}</Text>
		</Styled.Cell>
	);
};

Cell.displayName = 'Table.Row.Cell';
