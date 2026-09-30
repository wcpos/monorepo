import * as React from 'react';
import { View } from 'react-native';

import { useRouter } from 'expo-router';
import { useObservableSuspense } from 'observable-hooks';
import Animated, { FadeIn } from 'react-native-reanimated';

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
import { useDocField } from '@wcpos/query';
import { Platform } from '@wcpos/utils/platform';
import { openExternalURL } from '@wcpos/utils/open-external-url';

import { useStoreSession } from '../../../../contexts/app-state';
import { useTheme } from '../../../../contexts/theme';
import { useT } from '../../../../contexts/translations';
import { storeListResource } from '../../hooks/store-list-resource';
import { UserAvatar } from '../user-avatar';
import { useSwitchStore } from '../../pos/cart/use-switch-store';
import { ClearLocalData } from '../../pos/cart/clear-local-data';

import type { ObservableResource } from 'observable-hooks';

type StoreDocument = import('@wcpos/database').StoreDocument;

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
 * @TODO - remove hardcoded screensize
 */
export function UserMenu() {
	const { wpCredentials, site, store, logout } = useStoreSession();
	const router = useRouter();
	const { screenSize } = useTheme();
	const stores = useDocField(wpCredentials, (value) => value.stores);
	// Subscribed, not read off the document: `display_name` is rendered in the trigger and
	// in both avatar fallbacks, but the only subscriptions here were stores$/avatar_url$, so
	// a rename never reached the header.
	const displayName = useDocField(wpCredentials, (value) => value.display_name) as
		string | undefined;
	const t = useT();
	const { handleSwitchStore, isSwitching } = useSwitchStore();

	// Held outside React on purpose — a resource rebuilt on each Suspense retry re-suspends
	// forever, and `StoreSubMenu` reads it with `useObservableSuspense`. See
	// `store-list-resource.ts`. The same resource the Orders and Reports filter bars read, so
	// the header and the pills share one subscription to this credential's stores.
	const storesResource = storeListResource(wpCredentials);

	return (
		<ClearLocalData
			trigger={(handleResetPress) => (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="sidebar" testID="user-menu-trigger" className="px-2">
							<HStack>
								<UserAvatar wpCredentials={wpCredentials} displayName={displayName} />
								{screenSize !== 'sm' ? <ButtonText>{displayName}</ButtonText> : null}
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
								onPress={() => openExternalURL('https://github.com/wcpos/electron/releases')}
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
										{/* Its own boundary. `StoreSubMenu` suspends until the stores land,
								    and the nearest boundary above this menu is the one expo-router
								    wraps every route in — whose production fallback is `null`, so a
								    submenu still waiting for its records would blank the screen
								    behind it rather than itself (#1707). */}
										<Suspense>
											<StoreSubMenu
												storesResource={storesResource}
												switchStore={handleSwitchStore}
												currentStoreID={store.localID!}
											/>
										</Suspense>
									</DropdownMenuSubContent>
								</DropdownMenuSub>
								<DropdownMenuSeparator />
							</>
						)}
						<DropdownMenuItem
							testID="clear-all-local-data"
							onPress={() => void handleResetPress()}
							variant="destructive"
						>
							<Icon name="trash" />
							<Text>{t('common.clear_all_local_data')}</Text>
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						{Platform.isWeb && (
							<DropdownMenuItem onPress={() => openExternalURL(`${site.home}/wp-admin`)}>
								<Icon name="wordpress" />
								<Text>{t('common.wordpress_admin')}</Text>
							</DropdownMenuItem>
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
			)}
		/>
	);
}
