import * as React from 'react';
import { useWindowDimensions, Linking } from 'react-native';

import { useNavigation } from '@react-navigation/native';
import { ObservableResource, useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Avatar from '@wcpos/components/src/avatar';
import Box from '@wcpos/components/src/box';
import Dropdown from '@wcpos/components/src/dropdown';
import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';
import Text from '@wcpos/components/src/text';

import StoreSelect from './store-select';
import useLocalData from '../../../../../contexts/local-data';
import useLogin from '../../../../../hooks/use-login';
import useLogout from '../../../../../hooks/use-logout';
import { t } from '../../../../../lib/translations';

/**
 * FIXME: If I don't memo this component the avatar flashes every time the cart is changed
 * Shouldn't the header components already be memoized?
 */
const UserMenu_ = () => {
	const { wpCredentials, isWebApp, initialProps, site, store } = useLocalData();
	const logout = useLogout();
	const login = useLogin();
	const navigation = useNavigation();
	const theme = useTheme();
	const dimensions = useWindowDimensions();
	const [opened, setOpened] = React.useState(false);
	const avatar_url = useObservableState(wpCredentials?.avatar_url$, wpCredentials?.avatar_url);
	const stores = useObservableState(wpCredentials?.stores$, wpCredentials?.stores);
	const [storeSelectModalOpened, setStoreSelectModalOpened] = React.useState(false);

	/**
	 *
	 */
	const storesResource = React.useMemo(
		() => new ObservableResource(wpCredentials.populate$('stores'), (val) => !!val),
		[wpCredentials]
	);

	/**
	 *
	 */
	const handleStoreSwitch = React.useCallback(
		async (storeID) => {
			login({
				siteID: site.uuid,
				wpCredentialsID: wpCredentials.uuid,
				storeID,
			});
		},
		[login, site.uuid, wpCredentials.uuid]
	);

	/**
	 *
	 */
	const items = React.useMemo(() => {
		if (isWebApp && initialProps) {
			const webMenu = [
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

			// if Store length is greater than 1, add stores to menu
			if (stores?.length > 1) {
				webMenu.splice(3, 0, { label: '__' });
				webMenu.splice(4, 0, {
					icon: 'rightLeft',
					label: t('Switch Store', { _tags: 'core' }),
					action: () => setStoreSelectModalOpened(true),
				});
			}

			return webMenu;
		} else {
			const desktopMenu = [
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

			// if Store length is greater than 1, add stores to menu
			if (stores?.length > 1) {
				desktopMenu.splice(3, 0, { label: '__' });
				desktopMenu.splice(3, 0, {
					icon: 'rightLeft',
					label: t('Switch Store', { _tags: 'core' }),
					action: () => setStoreSelectModalOpened(true),
				});
			}

			return desktopMenu;
		}
	}, [initialProps, isWebApp, logout, navigation, site.home, stores]);

	return (
		<>
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

			<Modal
				title={t('Select a Store', { _tags: 'core' })}
				onClose={() => setStoreSelectModalOpened(false)}
				opened={storeSelectModalOpened}
			>
				<StoreSelect
					storesResource={storesResource}
					onSelect={handleStoreSwitch}
					currentStoreID={store.localID}
				/>
			</Modal>
		</>
	);
};

export const UserMenu = React.memo(UserMenu_);
