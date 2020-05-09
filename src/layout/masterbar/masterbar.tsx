import React from 'react';
import { useRoute, useNavigation } from '@react-navigation/native';
import Header from '../header';
import Button from '../../components/button';
import Popover from '../../components/popover';
import Text from '../../components/text';
import UserMenu from './user-menu';
import Avatar from '../../components/avatar';
import useUser from '../../hooks/use-user';

interface Props {}

const MasterBar: React.FC<Props> = () => {
	const route = useRoute();
	const navigation = useNavigation();
	const { user, logout } = useUser();

	return (
		<Header
			title={route.name}
			left={<Button title="Menu" onPress={() => navigation.openDrawer()} />}
			right={
				// <Popover content={<UserMenu />}>
				<>
					<Text>{user.first_name}</Text>
					<Button onPress={logout} title="Logout" />
					<Avatar src="blah" placeholder="jj" />
				</>
				// </Popover>
			}
		/>
	);
};

export default MasterBar;
