import * as React from 'react';
import { ViewStyle } from 'react-native';
import Text from '../text';
import * as Styled from './styles';

export interface TableCellProps {
	children?: React.ReactNode;
	item?: any;
	column: import('./table').ColumnProps;
	style?: ViewStyle;
}

const Cell = ({ children, item, column, style }: TableCellProps) => {
	const { key, flexGrow = 1, flexShrink = 1, flexBasis = 'auto', width = '100%' } = column;

	if (children) {
		return (
			<Styled.Cell style={[{ flexGrow, flexShrink, flexBasis, width }, style]}>
				{typeof children === 'function' ? children({ item, column }) : children}
			</Styled.Cell>
		);
	}

	return (
		<Styled.Cell style={[{ flexGrow, flexShrink, flexBasis, width }, style]}>
			<Text>{String(item[key] ?? '')}</Text>
		</Styled.Cell>
	);
};

export default Cell;
