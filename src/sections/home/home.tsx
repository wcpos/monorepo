import React, { useEffect } from 'react';
import SplashScreen from 'react-native-splash-screen';
import { View, Text, ActivityIndicator, StatusBar, AsyncStorage } from 'react-native';

type Props = {
	navigation: import('react-navigation').NavigationScreenProp<{}, {}>;
};

const Home = ({ navigation }: Props) => {
	useEffect(() => {
		// do stuff while splash screen is shown
		// After having done stuff (such as async tasks) hide the splash screen
		const timer = setTimeout(async () => {
			const userToken = await AsyncStorage.getItem('userToken');
			SplashScreen.hide();
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

export default Home;
