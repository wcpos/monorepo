import React from 'react';
import Segment, { SegmentGroup } from '../../../components/segment';
import Site from './site';
import useDatabase from '../../../hooks/use-database';
import useObservable from '../../../hooks/use-observable';

// const sites = [
// 	{
// 		name: 'Demo Site',
// 		url: 'https://demo.wcpos.com',
// 		stores: [
// 			{
// 				name: 'UK Store',
// 				users: [123, 347],
// 			},
// 			{
// 				name: 'US Store',
// 				users: [123],
// 			},
// 		],
// 		users: [{ name: 'Paul Kilmurray' }, { name: 'Store Manager' }],
// 	},
// 	{
// 		name: 'WooCommerce POS Development',
// 		url: 'https://dev.local/wp/latest/',
// 		stores: [],
// 		users: [
// 			{
// 				name: 'Paul Kilmurray',
// 			},
// 		],
// 	},
// 	{
// 		name: 'New Site',
// 		url: 'https://wcposdev.wpengine.com/',
// 		stores: [],
// 		users: [],
// 	},
// ];

const Sites = () => {
	const { sitesDB } = useDatabase();

	const sites = useObservable(
		sitesDB.collections
			.get('sites')
			.query()
			// .observeWithColumns(['name', 'connection_status']),
			.observe(),
		[]
	);

	return (
		sites.length > 0 && (
			<SegmentGroup style={{ width: 460 }}>
				<Segment content="Sites"></Segment>
				{sites.map(site => (
					<Segment key={site.id}>
						<Site site={site} />
					</Segment>
				))}
			</SegmentGroup>
		)
	);
};

export default Sites;
