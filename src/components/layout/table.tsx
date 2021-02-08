import * as React from 'react';
import Segment, { SegmentGroup } from '../segment';

type Props = {
	actions: React.ReactNode;
	table: React.ReactNode;
	footer: React.ReactNode;
};

const Table = ({ actions, table, footer }: Props) => {
	return (
		<SegmentGroup style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
			<Segment style={{ flex: -1 }}>{actions}</Segment>
			<Segment style={{ flex: 1, padding: 0 }}>{table}</Segment>
			<Segment style={{ flex: -1 }} content={footer} />
		</SegmentGroup>
	);
};

export default Table;
