import React from 'react';
import { View, Button, AsyncStorage } from 'react-native';

type Props = {
	navigation: import('react-navigation').NavigationScreenProp<{}, {}>;
};

const Modal = ({ navigation }: Props) => {
	return (
		<View style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
			<View style={{ width: '50%', marginBottom: 20 }}>
				<Button
					title="Go Back"
					onPress={() => {
						navigation.goBack();
					}}
				/>
			</View>
			<View style={{ width: '50%' }}>
				<Button
					title="Save User Token"
					onPress={async () => {
						await AsyncStorage.setItem('userToken', '123');
						navigation.navigate('Home');
					}}
				/>
			</View>
		</View>
	);
};

export default Modal;
