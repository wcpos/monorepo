import * as React from 'react';
import { useRoute, useNavigation, DrawerActions } from '@react-navigation/native';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Button from '@wcpos/common/src/components/button';
import Text from '@wcpos/common/src/components/text';
import Avatar from '@wcpos/common/src/components/avatar';
import Dropdown from '@wcpos/common/src/components/dropdown';
import UserSettings from './user-settings';
import Header from '../header';

const MasterBar = () => {
	const route = useRoute();
	const navigation = useNavigation();
	const { user, online, screen, unsetLastUser } = useAppState();
	const [showSettings, setShowSettings] = React.useState(false);

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
				<Dropdown
					activator={user?.displayName}
					items={[
						{
							label: 'Logout',
							action: async () => {
								await unsetLastUser();
							},
						},
						{
							label: 'Settings',
							action: () => setShowSettings(true),
						},
					]}
				/>
				<Avatar src="blah" placeholder="jj" />

				{showSettings && <UserSettings onClose={() => setShowSettings(false)} />}
			</Header.Right>
		</Header>
	);
};

export default MasterBar;
