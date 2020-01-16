import React from 'react';
import Segment, { SegmentGroup } from '../../../components/segment';
import Site from './site';

const Sites = ({ sites }) => {
	return (
		<SegmentGroup style={{ width: 460 }}>
			<Segment content="Sites"></Segment>
			{sites.map(site => (
				<Segment key={site.id}>
					<Site site={site} />
				</Segment>
			))}
		</SegmentGroup>
	);
};

export default Sites;
