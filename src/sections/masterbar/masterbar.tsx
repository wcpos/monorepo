import React from 'react';
import { AsyncStorage } from 'react-native';
import { BarView, LeftView, CenterView, RightView, TitleText } from './styles';
import Button from '../../components/button';

interface Props {
	navigation: import('react-navigation').NavigationScreenProp<{}, {}>;
	title: string;
}

const MasterBar = ({ navigation, title }: Props) => {
	return (
		<BarView>
			<LeftView>
				<Button title="Menu" onPress={() => navigation.openDrawer()} />
			</LeftView>
			<CenterView>
				<TitleText>{title}</TitleText>
			</CenterView>
			<RightView>
				<Button
					title="Logout"
					onPress={async () => {
						await AsyncStorage.removeItem('userToken');
						navigation.navigate('Auth');
					}}
				/>
			</RightView>
		</BarView>
	);
};

export default MasterBar;
