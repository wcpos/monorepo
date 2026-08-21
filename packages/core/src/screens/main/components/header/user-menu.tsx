import * as React from 'react';
import { View } from 'react-native';

import { useRouter } from 'expo-router';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import Animated, { FadeIn } from 'react-native-reanimated';

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@wcpos/components/alert-dialog';
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
import { useDocField, useQueryRuntime } from '@wcpos/query';
import { Platform } from '@wcpos/utils/platform';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { openExternalURL } from '@wcpos/utils/open-external-url';
import { forgetUnsentChanges, type UnsentChanges } from '@wcpos/utils/unsent-changes';

import { useStoreSession } from '../../../../contexts/app-state';
import { useTheme } from '../../../../contexts/theme';
import { useT } from '../../../../contexts/translations';
import { reloadApp } from '../../../../utils/reload-app';
import { useImageAttachment } from '../../hooks/use-image-attachment';
import { countUnsentChanges, describeResetConfirm } from '../../hooks/use-unsent-changes';

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
function UserAvatarImage({
	wpCredentials,
	displayName,
}: {
	wpCredentials: WPCredentialsDocument;
	displayName?: string;
}) {
	const avatarUrl = useDocField(wpCredentials, (value) => value.avatar_url);
	const { uri } = useImageAttachment(wpCredentials, avatarUrl as string);

	return <Avatar source={{ uri }} fallback={getInitials(displayName)} />;
}

function UserAvatar({
	wpCredentials,
	displayName,
}: {
	wpCredentials: WPCredentialsDocument;
	displayName?: string;
}) {
	return (
		<Suspense fallback={<Avatar source={{ uri: undefined }} fallback={getInitials(displayName)} />}>
			<UserAvatarImage wpCredentials={wpCredentials} displayName={displayName} />
		</Suspense>
	);
}

/**
 * @TODO - remove hardcoded screensize
 */
export function UserMenu() {
	const { wpCredentials, site, store, logout, switchStore } = useStoreSession();
	const router = useRouter();
	const { screenSize } = useTheme();
	const { engine } = useQueryRuntime();
	const stores = useDocField(wpCredentials, (value) => value.stores);
	// Subscribed, not read off the document: `display_name` is rendered in the trigger and
	// in both avatar fallbacks, but the only subscriptions here were stores$/avatar_url$, so
	// a rename never reached the header.
	const displayName = useDocField(wpCredentials, (value) => value.display_name) as
		string | undefined;
	const t = useT();
	const [isSwitching, setIsSwitching] = React.useState(false);
	/** Non-null while the reset confirm is open, carrying the reading it must state. */
	const [confirmingReset, setConfirmingReset] = React.useState<UnsentChanges | null>(null);
	/**
	 * True once a clear is scheduled on a build that cannot restart itself
	 * (production native, no expo-updates). The register must freeze behind an
	 * overlay until the relaunch: anything sold after the confirm would be
	 * silently destroyed by the pre-hydration clear on the next launch.
	 */
	const [restartRequired, setRestartRequired] = React.useState(false);

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

	/**
	 * Clearing local data destroys the durable mutation queue, so it destroys any
	 * completed sale that never reached the server. Count them first and put the
	 * number in the confirm (#1098) — the same check the root error screen's reset
	 * makes, through the same helper. A count that cannot be taken opens the
	 * confirm anyway with the worst-case warning: refusing would strand a cashier
	 * whose profile is exactly the kind this action exists to repair.
	 */
	const handleResetPress = async () => {
		setConfirmingReset(await countUnsentChanges(engine));
	};

	/**
	 * The databases must never be destroyed under the mounted provider tree:
	 * every open RxDB handle (AppState.userDB included) would keep pointing at
	 * removed storage. So the clear is scheduled as a pre-hydration flag and the
	 * app is reloaded — the next load clears before anything re-opens them.
	 */
	const handleReset = async () => {
		setConfirmingReset(null);
		forgetUnsentChanges();

		if (scheduleClearLocalDataOnNextLoad()) {
			if (reloadApp()) {
				return;
			}
			// Production native cannot restart itself (no expo-updates): the data
			// stays intact until the relaunch, and the overlay keeps it that way.
			setRestartRequired(true);
			return;
		}

		uiLogger.error('Failed to schedule the pre-hydration reset; falling back to direct clear', {
			code: ERROR_CODES.UNEXPECTED_ERROR,
		});

		if (Platform.OS !== 'web') {
			// Without the flag, a direct clear would leave the running app pointing
			// at destroyed databases with no reload to recover it — refuse instead.
			Toast.show({
				type: 'error',
				title: t('common.clear_all_local_data_failed'),
			});
			return;
		}

		// Clear databases to ensure clean start
		try {
			const result = await clearAllDB();
			uiLogger.info(result.message);
		} catch (err) {
			uiLogger.error('Failed to clear database:', {
				code: ERROR_CODES.UNEXPECTED_ERROR,
				context: { error: err },
			});
		}

		// Reload the app to reinitialize everything
		reloadApp();
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
				router.replace({
					pathname: '/',
					params: { store: String(nextStore.id) },
				});
			} else {
				router.replace('/');
			}
		} catch (error) {
			Toast.show({
				type: 'error',
				title: t('common.store_switch_failed'),
				description: getErrorMessage(error),
			});
			uiLogger.error('Store switch failed', {
				code: ERROR_CODES.UNEXPECTED_ERROR,
				context: { error },
			});
		} finally {
			setIsSwitching(false);
		}
	};

	return (
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
								<StoreSubMenu
									storesResource={storesResource}
									switchStore={handleSwitchStore}
									currentStoreID={store.localID!}
								/>
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
			<AlertDialog
				open={confirmingReset !== null}
				onOpenChange={(open: boolean) => {
					if (!open) setConfirmingReset(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t('common.clear_all_local_data_title')}</AlertDialogTitle>
						<AlertDialogDescription>
							{confirmingReset ? describeResetConfirm(confirmingReset, t) : null}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel testID="clear-all-local-data-cancel">
							<Text>{t('common.cancel')}</Text>
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							testID="clear-all-local-data-confirm"
							onPress={() => void handleReset()}
						>
							<Text>{t('common.clear_all_local_data_confirm')}</Text>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			{restartRequired ? (
				<Portal name="clear-local-data-restart-overlay">
					<View
						testID="clear-local-data-restart-overlay"
						className="bg-background/80 absolute inset-0 z-50 items-center justify-center gap-3 p-6"
					>
						<Text className="text-lg font-bold">
							{t('common.clear_all_local_data_restart_required')}
						</Text>
						<Text className="text-center">
							{t('common.clear_all_local_data_restart_required_body')}
						</Text>
					</View>
				</Portal>
			) : null}
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
