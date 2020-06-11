import React from 'react';
import { useRoute, useNavigation } from '@react-navigation/native';
import Header from '../header';
import Button from '../../components/button';
import Popover from '../../components/popover';
import Text from '../../components/text';
import UserMenu from './user-menu';
import Avatar from '../../components/avatar';
import useDatabase from '../../hooks/use-database';
import { AppContext } from '../../app';

interface Props {}

const MasterBar: React.FC<Props> = () => {
	const route = useRoute();
	const navigation = useNavigation();
	const { user, logout } = useDatabase();
	const [appState] = React.useContext(AppContext);

	return (
		<Header>
			<Header.Left>
				<Button title="Menu" onPress={() => navigation.openDrawer()} />
			</Header.Left>
			<Header.Title>{route.name}</Header.Title>
			<Header.Right>
				<Text type="inverse">{appState.online ? 'online' : 'offline'}</Text>
			</Header.Right>
			<Header.Right>
				<Text>{user.first_name}</Text>
				<Button onPress={logout} title="Logout" />
				<Avatar src="blah" placeholder="jj" />
			</Header.Right>
		</Header>
	);
};

export default MasterBar;
