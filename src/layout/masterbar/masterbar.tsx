import * as React from 'react';
import { useRoute, useNavigation, DrawerActions } from '@react-navigation/native';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Button from '@wcpos/common/src/components/button';
import Text from '@wcpos/common/src/components/text';
import Header from '../header';
import UserMenu from './user-menu';

const MasterBar = () => {
	const route = useRoute();
	const navigation = useNavigation();
	const { user, online, screen, unsetLastUser } = useAppState();

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
				<Text type="inverse">{online ? 'online' : 'offline'}</Text>
				<Text type="inverse">{screen.width}</Text>
			</Header.Right>
			<Header.Right>
				<UserMenu />
			</Header.Right>
		</Header>
	);
};

export default MasterBar;
