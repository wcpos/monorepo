import React from 'react';
import { useTable, useSortBy } from 'react-table';
import * as Styled from './styles';
import Header from './header';
import Row from './row';

interface Props {
	columns: import('react-table').Column[];
	data: {}[];
}

const Table: React.FC<Props> = ({ ...props }) => {
	const columns = React.useMemo(() => props.columns, [props.columns]);
	const data = React.useMemo(() => props.data, [props.data]);

	const { headers, rows, prepareRow } = useTable(
		{
			columns,
			data,
		},
		useSortBy
	);

	return (
		<Styled.TableWrapper>
			<Header headers={headers} />
			{rows.map((row) => {
				prepareRow(row);
				return <Row row={row} />;
			})}
		</Styled.TableWrapper>
	);
};

export default Table;
