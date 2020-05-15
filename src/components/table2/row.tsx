import React from 'react';
import Cell from './cell';
import * as Styled from './styles';

interface Props {
	row: import('react-table').Row;
}

const Row: React.FC<Props> = ({ row }) => {
	return (
		<Styled.Row>
			{row.cells.map((cell) => {
				return <Cell cell={cell} />;
			})}
		</Styled.Row>
	);
};

export default Row;
