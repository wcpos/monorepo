import * as React from 'react';
import { useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from 'styled-components/native';
import Avatar from '@wcpos/components/src/avatar';
import Dropdown from '@wcpos/components/src/dropdown';
import Text from '@wcpos/components/src/text';
import Box from '@wcpos/components/src/box';
import Icon from '@wcpos/components/src/icon';
import useAuth from '@wcpos/hooks/src/use-auth';

export const UserMenu = () => {
	const { logout, wpCredentials } = useAuth();
	const navigation = useNavigation();
	const theme = useTheme();
	const dimensions = useWindowDimensions();

	return (
		<Dropdown
			items={[
				{
					label: 'Settings',
					action: () => navigation.navigate('Settings'),
				},
				{
					label: 'Logout',
					action: logout,
					type: 'critical',
				},
			]}
		>
			<Box horizontal space="xSmall" align="center">
				<Avatar
					src={wpCredentials?.avatar_url}
					// placeholder="PK"
					size="small"
				/>
				{dimensions.width >= theme.screens.small ? (
					<Text type="inverse">{wpCredentials?.display_name}</Text>
				) : null}
				<Icon name="caretDown" type="inverse" size="small" />
			</Box>
		</Dropdown>
	);
};
