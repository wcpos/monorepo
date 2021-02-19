import * as React from 'react';
import { useRoute, useNavigation, DrawerActions } from '@react-navigation/native';
import Header from '../header';
import Button from '../../components/button';
import Popover from '../../components/popover';
import Text from '../../components/text';
import UserMenu from './user-menu';
import Avatar from '../../components/avatar';
import useAppState from '../../hooks/use-app-state';

const MasterBar = () => {
	const route = useRoute();
	const navigation = useNavigation();
	const [appState, dispatch, actionTypes] = useAppState();

	const openDrawer = React.useCallback(() => {
		navigation.dispatch(DrawerActions.openDrawer());
	}, []);

	return (
		<Header>
			<Header.Left>
				<Button title="Menu" onPress={openDrawer} />
			</Header.Left>
			<Header.Title>{route.name}</Header.Title>
			<Header.Right>
				<Text type="inverse">{appState.online ? 'online' : 'offline'}</Text>
				<Text type="inverse">{appState.window.width}</Text>
			</Header.Right>
			<Header.Right>
				<Text>{appState.user.display_name}</Text>
				<Button onPress={() => dispatch({ type: actionTypes.STORE_LOGOUT })} title="Logout" />
				<Avatar src="blah" placeholder="jj" />
			</Header.Right>
		</Header>
	);
};

export default MasterBar;
