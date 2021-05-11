import * as React from 'react';
import { useRoute, useNavigation, DrawerActions } from '@react-navigation/native';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Button from '@wcpos/common/src/components/button';
import Popover from '@wcpos/common/src/components/popover';
import Text from '@wcpos/common/src/components/text';
import Avatar from '@wcpos/common/src/components/avatar';
import Dropdown from '@wcpos/common/src/components/dropdown';
import UserMenu from './user-menu';
import Header from '../header';

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
				<Dropdown activator={user?.displayName} items={['Logout']} />
				<Button
					onPress={async () => {
						await unsetLastUser();
					}}
					title="Logout"
				/>
				<Avatar src="blah" placeholder="jj" />
			</Header.Right>
		</Header>
	);
};

export default MasterBar;
