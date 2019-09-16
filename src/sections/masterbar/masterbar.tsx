import React from 'react';
import { AsyncStorage, View } from 'react-native';
import { animated, useSpring } from 'react-spring/native';
import { BarView, LeftView, CenterView, RightView, TitleText } from './styles';
import Button from '../../components/button';
import Toast from '../../components/toast';
import Text from '../../components/text';
import Popover from '../../components/popover';

interface Props {
	navigation: import('react-navigation').NavigationScreenProp<{}, {}>;
	title: string;
}

const MasterBar = ({ navigation, title }: Props) => {
	const fade = useSpring({ opacity: 1, from: { opacity: 0 }, config: { duration: 3000 } });
	const AnimatedView = animated(RightView);

	return (
		<BarView>
			<LeftView>
				<Button title="Menu" onPress={() => navigation.openDrawer()} />
			</LeftView>
			<CenterView>
				<TitleText>{title}</TitleText>
				<Popover content={<Text>This is the pop!</Text>}>
					<Text style={{ color: '#FFFFFF' }}>popover</Text>
				</Popover>
			</CenterView>
			<AnimatedView style={fade}>
				<Button
					title="Logout"
					onPress={() => Toast.info('This is a Toast!', Toast.SHORT)}
					// onPress={async () => {
					// 	await AsyncStorage.removeItem('userToken');
					// 	navigation.navigate('Auth');
					// }}
				/>
			</AnimatedView>
		</BarView>
	);
};

export default MasterBar;
