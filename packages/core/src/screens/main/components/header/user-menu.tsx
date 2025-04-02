import * as React from 'react';
import { Linking } from 'react-native';

import { useRouter } from 'expo-router';
import {
	ObservableResource,
	useObservableEagerState,
	useObservableSuspense,
} from 'observable-hooks';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Avatar } from '@wcpos/components/avatar';
import { Button, ButtonText } from '@wcpos/components/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from '@wcpos/components/dropdown-menu';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';

import { useAppState } from '../../../../contexts/app-state';
import { useTheme } from '../../../../contexts/theme';
import { useT } from '../../../../contexts/translations';
import { useImageAttachment } from '../../hooks/use-image-attachment';

type StoreDocument = import('@wcpos/database').StoreDocument;

interface StoreSubMenuProps {
	storesResource: ObservableResource<StoreDocument[]>;
	switchStore: (store: StoreDocument) => void;
	currentStoreID: string;
}

/**
 *
 */
const StoreSubMenu = ({ storesResource, switchStore, currentStoreID }: StoreSubMenuProps) => {
	const stores = useObservableSuspense(storesResource);

	return (
		<Animated.View entering={FadeIn.duration(200)}>
			{stores.map((store) => (
				<DropdownMenuItem
					key={store.localID}
					onPress={() => switchStore(store)}
					disabled={store.localId === currentStoreID}
				>
					<Text>{store.name}</Text>
				</DropdownMenuItem>
			))}
		</Animated.View>
	);
};

/**
 * @TODO - remove hardcoded screensize
 */
export const UserMenu = () => {
	const { wpCredentials, isWebApp, site, store, logout, switchStore } = useAppState();
	const router = useRouter();
	const { screenSize } = useTheme();
	const avatarUrl = useObservableEagerState(wpCredentials?.avatar_url$);
	const stores = useObservableEagerState(wpCredentials?.stores$);
	const t = useT();
	const avatarSource = useImageAttachment(wpCredentials, avatarUrl);

	/**
	 *
	 */
	const storesResource = React.useMemo(
		() => new ObservableResource(wpCredentials.populate$('stores'), (val) => !!val),
		[wpCredentials]
	);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button className="rounded-none bg-transparent px-3 hover:bg-white/10">
					<HStack>
						<Avatar
							source={avatarSource}
							// placeholder="PK"
						/>
						{screenSize !== 'sm' ? <ButtonText>{wpCredentials?.display_name}</ButtonText> : null}
						<Icon name="caretDown" />
					</HStack>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" side="bottom">
				<DropdownMenuItem onPress={() => router.push('/(modals)/settings')}>
					<Icon name="gear" />
					<Text>{t('Settings', { _tags: 'core' })}</Text>
				</DropdownMenuItem>
				<DropdownMenuItem onPress={() => router.push('/support')}>
					<Icon name="commentQuestion" />
					<Text>{t('Support', { _tags: 'core' })}</Text>
				</DropdownMenuItem>
				{isWebApp && (
					<DropdownMenuItem
						onPress={() => Linking.openURL('https://github.com/wcpos/electron/releases')}
					>
						<Icon name="download" />
						<Text>{t('Desktop App', { _tags: 'core' })}</Text>
					</DropdownMenuItem>
				)}
				<DropdownMenuSeparator />
				{stores?.length > 1 && (
					<>
						<DropdownMenuSub>
							<DropdownMenuSubTrigger>
								<Icon name="rightLeft" />
								<Text>{t('Switch Store', { _tags: 'core' })}</Text>
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent>
								<StoreSubMenu
									storesResource={storesResource}
									switchStore={switchStore}
									currentStoreID={store.localID}
								/>
							</DropdownMenuSubContent>
						</DropdownMenuSub>
						<DropdownMenuSeparator />
					</>
				)}
				{isWebApp && (
					<DropdownMenuItem onPress={() => Linking.openURL(`${site.home}/wp-admin`)}>
						<Icon name="wordpress" />
						<Text>{t('WordPress Admin', { _tags: 'core' })}</Text>
					</DropdownMenuItem>
				)}
				<DropdownMenuItem onPress={logout} variant="destructive">
					<Icon name="arrowRightFromBracket" className="fill-destructive" />
					<Text>{t('Logout', { _tags: 'core' })}</Text>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
