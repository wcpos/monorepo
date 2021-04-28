import * as React from 'react';
import { View } from 'react-native';
import AuthDB from './auth-db';
import StoreDB from './store-db';
import Segment from '../../components/segment';

const Support = () => {
	return (
		<View style={{ flexDirection: 'row' }}>
			<Segment.Group style={{ width: '50%' }}>
				<Segment>Authentication Database</Segment>
				<Segment>
					<AuthDB />
				</Segment>
			</Segment.Group>
			<Segment.Group style={{ width: '50%' }}>
				<Segment>Store Database</Segment>
				<Segment>
					<StoreDB />
				</Segment>
			</Segment.Group>
		</View>
	);
};

export default Support;
