import React from 'react';
import { View, Text, Button, AsyncStorage } from 'react-native';

interface Props {
	navigation: import('react-navigation').NavigationScreenProp<{}, {}>;
}

const MasterBar = ({ navigation }: Props) => {
	return (
		<View style={{ display: 'flex', flexDirection: 'row', backgroundColor: '#f5f5f5' }}>
			<View>
				<Button title="Menu" onPress={() => navigation.openDrawer()} />
			</View>
			<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
				<Text style={{ fontSize: 18 }}>Header</Text>
			</View>
			<View>
				<Button
					title="Logout"
					onPress={async () => {
						await AsyncStorage.removeItem('userToken');
						navigation.navigate('Auth');
					}}
				/>
			</View>
		</View>
	);
};

export default MasterBar;
