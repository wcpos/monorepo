import React from 'react';
import * as Styled from './styles';

interface Props {
	cell: import('react-table').Cell;
}

const Cell: React.FC<Props> = ({ cell }) => {
	return <Styled.Cell>{cell.render('Cell')}</Styled.Cell>;
};

export default Cell;
