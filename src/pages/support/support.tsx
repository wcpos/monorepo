import React from 'react';
import { View, Text } from 'react-native';
import Sites from './sites-db';

interface Props {}

const Support: React.FC<Props> = ({ header, main, title }) => {
	return (
		<>
			<Text>Support</Text>
			<Sites />
		</>
	);
};

export default Support;
