import * as React from 'react';
import { useWindowDimensions, Linking } from 'react-native';

import { useNavigation } from '@react-navigation/native';
import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Avatar from '@wcpos/components/src/avatar';
import Box from '@wcpos/components/src/box';
import Dropdown from '@wcpos/components/src/dropdown';
import Icon from '@wcpos/components/src/icon';
import Text from '@wcpos/components/src/text';

import useLocalData from '../../../../../contexts/local-data';
import useLogout from '../../../../../hooks/use-logout';
import { t } from '../../../../../lib/translations';

/**
 * FIXME: If I don't memo this component the avatar flashes every time the cart is changed
 * Shouldn't the header components already be memoized?
 */
const UserMenu_ = () => {
	const { wpCredentials, isWebApp, initialProps, site } = useLocalData();
	const logout = useLogout();
	const navigation = useNavigation();
	const theme = useTheme();
	const dimensions = useWindowDimensions();
	const [opened, setOpened] = React.useState(false);
	const avatar_url = useObservableState(wpCredentials?.avatar_url$, wpCredentials?.avatar_url);

	const items = React.useMemo(() => {
		if (isWebApp && initialProps) {
			return [
				{
					icon: 'gear',
					label: t('Settings', { _tags: 'core' }),
					action: () => navigation.navigate('Settings'),
				},
				{
					icon: 'commentQuestion',
					label: t('Support', { _tags: 'core' }),
					action: () => navigation.navigate('SupportStack'),
				},
				{
					icon: 'download',
					label: t('Desktop App', { _tags: 'core' }),
					action: () => Linking.openURL('https://github.com/wcpos/electron/releases'),
				},
				{ label: '__' },
				{
					icon: 'wordpress',
					label: t('WordPress Admin', { _tags: 'core' }),
					action: () => Linking.openURL(`${site.home}/wp-admin`),
				},
				{
					icon: 'arrowRightFromBracket',
					label: t('Logout', { _tags: 'core' }),
					action: () => Linking.openURL(initialProps.logout_url),
					type: 'critical',
				},
			];
		} else {
			return [
				{
					icon: 'gear',
					label: t('Settings', { _tags: 'core' }),
					action: () => navigation.navigate('Settings'),
				},
				{
					icon: 'commentQuestion',
					label: t('Support', { _tags: 'core' }),
					action: () => navigation.navigate('SupportStack'),
				},
				{ label: '__' },
				{
					icon: 'arrowRightFromBracket',
					label: t('Logout', { _tags: 'core' }),
					action: logout,
					type: 'critical',
				},
			];
		}
	}, [initialProps, isWebApp, logout, navigation]);

	return (
		<Dropdown
			placement="bottom-end"
			items={items}
			opened={opened}
			onOpen={() => setOpened(true)}
			onClose={() => setOpened(false)}
		>
			<Box horizontal space="xSmall" align="center">
				<Avatar
					source={avatar_url}
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

export const UserMenu = React.memo(UserMenu_);
