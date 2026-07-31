import * as React from 'react';
import { Linking, View } from 'react-native';

import { useRouter } from 'expo-router';
import {
	ObservableResource,
	useObservableEagerState,
	useObservableSuspense,
} from 'observable-hooks';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Avatar, getInitials } from '@wcpos/components/avatar';
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
import { Loader } from '@wcpos/components/loader';
import { Portal } from '@wcpos/components/portal';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';
import { clearAllDB, scheduleClearLocalDataOnNextLoad } from '@wcpos/database';
import { Platform } from '@wcpos/utils/platform';
import { getLogger } from '@wcpos/utils/logger';

import { useAppState } from '../../../../contexts/app-state';
import { useTheme } from '../../../../contexts/theme';
import { useT } from '../../../../contexts/translations';
import { useImageAttachment } from '../../hooks/use-image-attachment';

const uiLogger = getLogger(['wcpos', 'ui', 'menu']);

type StoreDocument = import('@wcpos/database').StoreDocument;
type WPCredentialsDocument = import('@wcpos/database').WPCredentialsDocument;

interface StoreSubMenuProps {
	storesResource: ObservableResource<StoreDocument[]>;
	switchStore: (store: StoreDocument) => Promise<void>;
	currentStoreID: string;
}

/**
 *
 */
function StoreSubMenu({ storesResource, switchStore, currentStoreID }: StoreSubMenuProps) {
	const stores = useObservableSuspense(storesResource);

	return (
		<Animated.View entering={FadeIn.duration(200)}>
			{stores.map((store) => (
				<DropdownMenuItem
					key={store.localID}
					onPress={() => switchStore(store)}
					disabled={store.localID === currentStoreID}
				>
					<Text>{store.name}</Text>
				</DropdownMenuItem>
			))}
		</Animated.View>
	);
}

/**
 * The image attachment hook suspends while the avatar loads, so it lives in
 * its own component behind a Suspense boundary that falls back to initials.
 */
function UserAvatarImage({ wpCredentials }: { wpCredentials: WPCredentialsDocument }) {
	const avatarUrl = useObservableEagerState(wpCredentials.avatar_url$!);
	const { uri } = useImageAttachment(wpCredentials, avatarUrl as string);

	return <Avatar source={{ uri }} fallback={getInitials(wpCredentials?.display_name)} />;
}

function UserAvatar({ wpCredentials }: { wpCredentials: WPCredentialsDocument }) {
	return (
		<Suspense
			fallback={
				<Avatar source={{ uri: undefined }} fallback={getInitials(wpCredentials?.display_name)} />
			}
		>
			<UserAvatarImage wpCredentials={wpCredentials} />
		</Suspense>
	);
}

/**
 * @TODO - remove hardcoded screensize
 */
export function UserMenu() {
	const { wpCredentials, site, store, logout, switchStore } = useAppState();
	const router = useRouter();
	const { screenSize } = useTheme();
	const stores = useObservableEagerState(wpCredentials?.stores$);
	const t = useT();
	const [isSwitching, setIsSwitching] = React.useState(false);

	/**
	 *
	 */
	const storesResource = React.useMemo(
		() =>
			new ObservableResource(
				wpCredentials.populate$('stores'),
				(val): val is StoreDocument[] => !!val
			),
		[wpCredentials]
	) as ObservableResource<StoreDocument[], StoreDocument[]>;

	const handleReset = async () => {
		if (Platform.OS === 'web') {
			if (scheduleClearLocalDataOnNextLoad()) {
				window.location.reload();
				return;
			}
			uiLogger.error('Failed to schedule the pre-hydration reset; falling back to direct clear');
		}

		// Clear databases to ensure clean start
		try {
			const result = await clearAllDB();
			uiLogger.info(result.message);
		} catch (err) {
			uiLogger.error('Failed to clear database:', { context: { error: err } });
		}

		// Reload the app to reinitialize everything
		window.location.reload();
	};

	const handleSwitchStore = async (nextStore: StoreDocument): Promise<void> => {
		setIsSwitching(true);
		try {
			await switchStore(nextStore);
			// The router owns the URL: passing the server store id as a param writes
			// `/?store=<id>` on web (so a refresh boots into the new store) without
			// clobbering Expo Router's own history state the way a manual
			// history.replaceState would. Boot-time `?store=` handling consumes and
			// removes the param as before.
			if (Platform.isWeb) {
				router.replace({ pathname: '/', params: { store: String(nextStore.id) } });
			} else {
				router.replace('/');
			}
		} catch (error) {
			Toast.show({
				type: 'error',
				title: t('common.store_switch_failed'),
				description: error instanceof Error ? error.message : String(error),
			});
			uiLogger.error('Store switch failed', { context: { error } });
		} finally {
			setIsSwitching(false);
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					testID="user-menu-trigger"
					className="text-sidebar-foreground web:hover:bg-white/10 rounded-none bg-transparent px-2"
				>
					<HStack>
						<UserAvatar wpCredentials={wpCredentials} />
						{screenSize !== 'sm' ? (
							<ButtonText className="text-sidebar-foreground">
								{wpCredentials?.display_name}
							</ButtonText>
						) : null}
						<Icon name="caretDown" className="text-sidebar-foreground" />
					</HStack>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" side="bottom">
				<DropdownMenuItem testID="settings-menu-item" onPress={() => router.push('/settings')}>
					<Icon name="gear" />
					<Text>{t('common.settings')}</Text>
				</DropdownMenuItem>
				<DropdownMenuItem onPress={() => router.push('/support')}>
					<Icon name="commentQuestion" />
					<Text>{t('common.support')}</Text>
				</DropdownMenuItem>
				{Platform.isWeb && (
					<DropdownMenuItem
						onPress={() => Linking.openURL('https://github.com/wcpos/electron/releases')}
					>
						<Icon name="download" />
						<Text>{t('common.desktop_app')}</Text>
					</DropdownMenuItem>
				)}
				<DropdownMenuSeparator />
				{Array.isArray(stores) && stores.length > 1 && (
					<>
						<DropdownMenuSub>
							<DropdownMenuSubTrigger>
								<Icon name="rightLeft" />
								<Text>{t('common.switch_store')}</Text>
							</DropdownMenuSubTrigger>
							<DropdownMenuSubContent>
								<StoreSubMenu
									storesResource={storesResource}
									switchStore={handleSwitchStore}
									currentStoreID={store.localID}
								/>
							</DropdownMenuSubContent>
						</DropdownMenuSub>
						<DropdownMenuSeparator />
					</>
				)}
				{Platform.isWeb && (
					<>
						<DropdownMenuItem onPress={handleReset} variant="destructive">
							<Icon name="trash" />
							<Text>{t('common.clear_all_local_data')}</Text>
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem onPress={() => Linking.openURL(`${site.home}/wp-admin`)}>
							<Icon name="wordpress" />
							<Text>{t('common.wordpress_admin')}</Text>
						</DropdownMenuItem>
					</>
				)}
				<DropdownMenuItem onPress={logout} variant="destructive">
					<Icon name="arrowRightFromBracket" />
					<Text>{t('common.logout')}</Text>
				</DropdownMenuItem>
			</DropdownMenuContent>
			{isSwitching ? (
				<Portal name="store-switch-overlay">
					<View
						testID="store-switch-overlay"
						className="bg-background/80 absolute inset-0 z-50 items-center justify-center gap-3"
					>
						<Loader size="xl" />
						<Text>{t('common.switching_store')}</Text>
					</View>
				</Portal>
			) : null}
		</DropdownMenu>
	);
}
