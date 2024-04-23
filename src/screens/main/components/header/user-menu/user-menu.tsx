import * as React from 'react';
import { useWindowDimensions, Linking } from 'react-native';

import { useNavigation } from '@react-navigation/native';
import { ObservableResource, useObservableEagerState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Avatar from '@wcpos/components/src/avatar';
import Box from '@wcpos/components/src/box';
import Dropdown from '@wcpos/components/src/dropdown';
import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';
import Text from '@wcpos/components/src/text';

import StoreSelect from './store-select';
import { useAppState } from '../../../../../contexts/app-state';
import { useT } from '../../../../../contexts/translations';
import { useImageAttachment } from '../../../hooks/use-image-attachment';

/**
 * FIXME: If I don't memo this component the avatar flashes every time the cart is changed
 * Shouldn't the header components already be memoized?
 */
export const UserMenu = () => {
	const { wpCredentials, isWebApp, initialProps, site, store, login, logout, switchStore } =
		useAppState();
	const navigation = useNavigation();
	const theme = useTheme();
	const dimensions = useWindowDimensions();
	const [opened, setOpened] = React.useState(false);
	const avatarUrl = useObservableEagerState(wpCredentials?.avatar_url$);
	const stores = useObservableEagerState(wpCredentials?.stores$);
	const [storeSelectModalOpened, setStoreSelectModalOpened] = React.useState(false);
	const t = useT();
	const avatarSource = useImageAttachment(wpCredentials, avatarUrl);

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
					action: logout,
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
	}, [initialProps, isWebApp, logout, navigation, site.home, stores?.length, t]);

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
						source={avatarSource}
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
					onSelect={switchStore}
					currentStoreID={store.localID}
				/>
			</Modal>
		</>
	);
};
