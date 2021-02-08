import * as React from 'react';
import { View, Text } from 'react-native';
// import Sites from './users-db';
// import Store from './store-db';
import Segment, { SegmentGroup } from '../../components/segment';

interface Props {}

const Support: React.FC<Props> = ({ header, main, title }) => {
	return (
		<>
			<SegmentGroup style={{ width: '50%' }}>
				<Segment>Authentication Database</Segment>
				<Segment>{/* <Sites /> */}</Segment>
			</SegmentGroup>
			<SegmentGroup style={{ width: '50%', height: '500px' }}>
				<Segment>Store Database</Segment>
				<Segment
					style={{
						flexBasis: '100%',
					}}
				>
					{/* <Store /> */}
				</Segment>
			</SegmentGroup>
		</>
	);
};

export default Support;
