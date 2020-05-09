import React from 'react';
import { View, Text } from 'react-native';
import StoreDB from './store-db';

interface Props {}

const Support: React.FC<Props> = ({ header, main, title }) => {
	return (
		<>
			<Text>Support</Text>
			<StoreDB />
		</>
	);
};

export default Support;
