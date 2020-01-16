import React from 'react';
import { View, Text, ActivityIndicator, Button } from 'react-native';

const Splash = () => {
	return (
		<View style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
			<View style={{ width: '50%' }}>
				<Text style={{ textAlign: 'center' }}>Splash Page</Text>
				<ActivityIndicator size="large" />
				<Button onPress={() => {}} title="Force reload" />
			</View>
		</View>
	);
};

export default Splash;
