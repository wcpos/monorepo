import React from 'react';
import { View, Button } from 'react-native';

type Props = {
	navigation: import('react-navigation').NavigationScreenProp<{}, {}>;
};

const Auth = ({ navigation }: Props) => {
	return (
		<View style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
			<View style={{ width: '50%' }}>
				<Button
					title="Login"
					onPress={() => {
						navigation.navigate('Modal');
					}}
				/>
			</View>
		</View>
	);
};

export default Auth;
