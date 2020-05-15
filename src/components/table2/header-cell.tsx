import React from 'react';
import * as Styled from './styles';

interface Props {
	column: import('react-table').ColumnInstance<{}>;
}

const Cell: React.FC<Props> = ({ column }) => {
	return (
		<Styled.HeaderCell {...column.getHeaderProps(column.getSortByToggleProps())}>
			{column.render('Header')}
			{column.isSorted ? (column.isSortedDesc ? ' 🔽' : ' 🔼') : ''}
		</Styled.HeaderCell>
	);
};

export default Cell;
