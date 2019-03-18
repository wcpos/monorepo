import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StatusBar, AsyncStorage } from 'react-native';

type Props = {
	navigation: import('react-navigation').NavigationScreenProp<{}, {}>;
};

const Loading = ({ navigation }: Props) => {
	// fetch async data
	// setTimeout to mimick delay
	useEffect(() => {
		const timer = setTimeout(async () => {
			const userToken = await AsyncStorage.getItem('userToken');
			navigation.navigate(userToken ? 'Main' : 'Auth');
		}, 1000);
		return () => {
			clearTimeout(timer);
		};
	}, [navigation]);

	return (
		<View style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
			<View style={{ width: '50%' }}>
				<Text style={{ textAlign: 'center' }}>Load Assets</Text>
				<ActivityIndicator size="large" />
				<StatusBar barStyle="default" />
			</View>
		</View>
	);
};

export default Loading;
