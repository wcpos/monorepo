import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';

const Splash = ({ navigation }) => {
	return (
		<View style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
			<View style={{ width: '50%' }}>
				<Text style={{ textAlign: 'center' }}>Splash Page</Text>
				<ActivityIndicator size="large" />
			</View>
		</View>
	);
};

export default Splash;
