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

const Cell = ({
	children,
	cellData,
	flexGrow = 1,
	flexShrink = 0,
	flexBasis = 'fill',
	width,
	style,
	rowData,
	dataKey,
}: TableCellProps) => {
	if (children) {
		return (
			<Styled.Cell style={[{ flexGrow, flexShrink, flexBasis, width }, style]}>
				{typeof children === 'function' ? children({ cellData }) : children}
			</Styled.Cell>
		);
	}

	return (
		<Styled.Cell style={[{ flexGrow, flexShrink, flexBasis, width }, style]}>
			<Text>{String(cellData ?? '')}</Text>
		</Styled.Cell>
	);
};

/**
 * note: statics need to be added after React.memo
 */
const MemoizedCell = React.memo(Cell);
MemoizedCell.displayName = 'Table.Body.Row.Cell';

export default MemoizedCell;
