import * as React from 'react';
import { useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from 'styled-components/native';
import Avatar from '@wcpos/common/src/components/avatar';
import Dropdown from '@wcpos/common/src/components/dropdown';
import Text from '@wcpos/common/src/components/text';
import Box from '@wcpos/common/src/components/box';
import Icon from '@wcpos/common/src/components/icon';
import Modal, { useModal } from '@wcpos/common/src/components/modal';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import UserSettings from './user-settings';

export const UserMenu = () => {
	const { site, wpCredentials, store } = useAppState();
	const { ref: refSettingsModal, open: openSettingsModal, close: closeSettingsModal } = useModal();
	const navigation = useNavigation();
	const theme = useTheme();
	const dimensions = useWindowDimensions();

	return (
		<>
			<Dropdown
				items={[
					{
						label: 'Settings',
						action: openSettingsModal,
					},
					{
						label: 'Logout',
						action: () => {
							site.collection.upsertLocal('current', { id: null });
							wpCredentials.collection.upsertLocal('current', { id: null });
							store.collection.upsertLocal('current', { id: null });
							navigation.navigate('Auth');
						},
						type: 'warning',
					},
				]}
			>
				<Box horizontal space="xSmall" align="center">
					<Avatar
						src="https://secure.gravatar.com/avatar/a2a53c07cdd4a8aa81c043baafd0915f"
						// placeholder="PK"
						size="small"
					/>
					{dimensions.width >= theme.screens.small ? <Text type="inverse">Test</Text> : null}
					<Icon name="caretDown" type="inverse" size="small" />
				</Box>
			</Dropdown>

			<Modal ref={refSettingsModal} title="Settings">
				<UserSettings onClose={closeSettingsModal} />
			</Modal>
		</>
	);
};
