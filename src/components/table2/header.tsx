import React from 'react';
import HeaderCell from './header-cell';
import * as Styled from './styles';

interface Props {
	headers: import('react-table').ColumnInstance<{}>[];
}

const Header: React.FC<Props> = ({ headers }) => {
	return (
		<Styled.HeaderRow>
			{headers.map((column) => (
				<HeaderCell column={column} />
			))}
		</Styled.HeaderRow>
	);
};

export default Header;
