import React from 'react';
import { AsyncStorage, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { BarView, LeftView, CenterView, RightView, TitleText } from './styles';
import Button from '../../components/button';
import Popover from '../../components/popover';
import UserMenu from './user-menu';

interface Props {
	navigation: import('react-navigation').NavigationScreenProp<{}, {}>;
	title: string;
}

const MasterBar = ({}: Props) => {
	const navigation = useNavigation();
	const title = 'hi';

	return (
		<BarView>
			<LeftView>
				<Button title="Menu" onPress={() => navigation.openDrawer()} />
			</LeftView>
			<CenterView>
				<TitleText>{title}</TitleText>
			</CenterView>
			<RightView>
				<Popover content={<UserMenu />}>
					<Button title="User" />
				</Popover>
			</RightView>
		</BarView>
	);
};

export default MasterBar;
