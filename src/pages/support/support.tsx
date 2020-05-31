import React from 'react';
import { View, Text } from 'react-native';
import Sites from './sites-db';
import Store from './store-db';
import Segment, { SegmentGroup } from '../../components/segment';

interface Props {}

const Support: React.FC<Props> = ({ header, main, title }) => {
	return (
		<React.Fragment>
			<SegmentGroup style={{ width: '50%' }}>
				<Segment>Sites Database</Segment>
				<Segment>
					<Sites />
				</Segment>
			</SegmentGroup>
			<SegmentGroup style={{ width: '50%', height: '500px' }}>
				<Segment>Store Database</Segment>
				<Segment
					style={{
						flexBasis: '100%',
					}}
				>
					<Store />
				</Segment>
			</SegmentGroup>
		</React.Fragment>
	);
};

export default Support;
