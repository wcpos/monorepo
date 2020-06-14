import React from 'react';
import Segment, { SegmentGroup } from '../../components/segment';

type Props = {
	actions: React.ReactNode;
	table: React.ReactNode;
	footer: React.ReactNode;
};

const Table = ({ actions, table, footer }: Props) => {
	return (
		<SegmentGroup>
			<Segment>{actions}</Segment>
			<Segment grow style={{ padding: 0 }}>
				{table}
			</Segment>
			<Segment content={footer} />
		</SegmentGroup>
	);
};

export default Table;
