import * as React from 'react';
import { ViewStyle } from 'react-native';
import Text from '../text';
import * as Styled from './styles';

export interface TableHeaderProps {
	columns: import('./table').ColumnProps<any>[];
	style?: ViewStyle;
}

const TableHeader = ({ columns, style }: TableHeaderProps) => {
	return (
		<Styled.HeaderRow>
			{columns.map((column) => {
				const { key, flexGrow = 1, flexShrink = 1, flexBasis = 'auto', width = '100%' } = column;
				return (
					<Styled.HeaderCell key={key} style={[{ flexGrow, flexShrink, flexBasis, width }, style]}>
						<Text>{column.label}</Text>
					</Styled.HeaderCell>
				);
			})}
		</Styled.HeaderRow>
	);
};

export default React.memo(TableHeader);
