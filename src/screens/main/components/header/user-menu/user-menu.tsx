import * as React from 'react';
import { useWindowDimensions } from 'react-native';

import { useNavigation } from '@react-navigation/native';
import { useTheme } from 'styled-components/native';

import Avatar from '@wcpos/components/src/avatar';
import Box from '@wcpos/components/src/box';
import Dropdown from '@wcpos/components/src/dropdown';
import Icon from '@wcpos/components/src/icon';
import Text from '@wcpos/components/src/text';

import useAuth from '../../../../../contexts/auth';

export const UserMenu = () => {
	const { logout, wpCredentials } = useAuth();
	const navigation = useNavigation();
	const theme = useTheme();
	const dimensions = useWindowDimensions();

	return (
		<Dropdown
			placement="bottom-end"
			items={[
				{
					icon: 'gear',
					label: 'Settings',
					action: () => navigation.navigate('Settings'),
				},
				{ label: '__' },
				{
					icon: 'arrowRightFromBracket',
					label: 'Logout',
					action: logout,
					type: 'critical',
				},
			]}
		>
			<Box horizontal space="xSmall" align="center">
				<Avatar
					source={wpCredentials?.avatar_url}
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
