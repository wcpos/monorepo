import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { useRouter } from 'expo-router';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { defer, filter, firstValueFrom, repeat, startWith, switchMap, timer } from 'rxjs';

import { observeCredentialStores, PENDING_USER_DB_READ } from '@wcpos/query/user-db';
import { Icon } from '@wcpos/components/icon';
import { Platform } from '@wcpos/utils/platform';
import { openExternalURL } from '@wcpos/utils/open-external-url';
import { MenuRow, MenuRowSeparator } from '@wcpos/components/menu-row';
import { Button } from '@wcpos/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@wcpos/components/dialog';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import type { ReadonlyWpCredentialsRecord } from '@wcpos/query/user-db';
import { requestStateManager } from '@wcpos/hooks/use-http-client/request-state-manager';
import { observeCashierSalesTotal, useDocField, useQueryRuntime } from '@wcpos/query';
import { log } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { credentialsListResource } from '../../../../hooks/user-db-list-resources';
import { useAppState, useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { convertLocalDateToUTCString } from '../../../../hooks/use-local-date';
import { useStoreDay } from '../../../../hooks/use-store-day';
import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import { AddUserButton } from '../../../auth/components/add-user-button';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { RecordAvatar } from '../../components/user-avatar';
import { usePanelSide } from '../contexts/overlay-side';
import { ClearLocalData } from './clear-local-data';
import { SwitchStoreSheet } from './switch-store-sheet';
import { useCurrentOrderOptional } from '../contexts/current-order/context';
import { isCartAttributed } from '../../../../services/register-session/cart-attribution';

export function useSalesToday() {
	const { wpCredentials, store } = useStoreSession();
	const runtime = useQueryRuntime();
	const storeDay = useStoreDay();
	const sales$ = React.useMemo(() => {
		// Re-arm at each store midnight (including DST); unsubscribing cancels the timer.
		const midnight$ = defer(() => {
			const { to } = storeDay.dayBounds(storeDay.today());
			return timer(new Date(to.getTime() + 1));
		}).pipe(repeat(), startWith(0));
		return midnight$.pipe(
			switchMap(() => {
				const { from, to } = storeDay.dayBounds(storeDay.today());
				// dayBounds ends inclusively; the read uses an exclusive upper bound.
				const end = new Date(to.getTime() + 1);
				// Local read only: opening the user sheet must not declare a new server fetch.
				return observeCashierSalesTotal(runtime.engine, {
					cashierId: String(wpCredentials.id),
					storeId: store.id ? String(store.id) : 'woocommerce-pos',
					fromGmt: convertLocalDateToUTCString(from),
					toGmt: convertLocalDateToUTCString(end),
				});
			})
		);
	}, [runtime.engine, runtime.locale, wpCredentials.id, store.id, storeDay]);
	return useObservableState(sales$, 0);
}

function SalesToday() {
	const total = useSalesToday();
	const { format } = useCurrencyFormat();
	const t = useT();
	return (
		<View
			testID="user-sheet-sales-today"
			className="min-h-row border-border flex-row items-center justify-between gap-2 border-b"
		>
			<Text>{t('register.your_sales_today')}</Text>
			<Text className="tabular-nums">{format(total)}</Text>
		</View>
	);
}

function UserRows() {
	const { site, store, wpCredentials, logout } = useStoreSession();
	const { login } = useAppState();
	const router = useRouter();
	const credentials = useObservableSuspense(credentialsListResource(site));
	const switchUser = async (credential: ReadonlyWpCredentialsRecord) => {
		try {
			// Switching is a one-shot read of the first non-pending database answer.
			const stores = await firstValueFrom(
				observeCredentialStores(credential).pipe(filter((value) => value !== PENDING_USER_DB_READ))
			);
			const next = stores.find((candidate) => candidate.id === store.id);
			requestStateManager.clearRefreshedToken();
			requestStateManager.setAuthFailed(false);
			if (!next) {
				await logout();
				router.replace('/connect');
				return;
			}
			await login({
				siteID: site.uuid!,
				wpCredentialsID: credential.uuid!,
				storeID: next.localID!,
			});
		} catch (error) {
			log.error('Store login failed', {
				code: ERROR_CODES.AUTH_UNEXPECTED,
				showToast: true,
				context: { error },
			});
		}
	};
	return (
		<>
			{credentials
				.filter((credential) => credential.uuid !== wpCredentials.uuid)
				.map((credential) => (
					<MenuRow
						key={credential.uuid}
						testID={`user-sheet-user-${credential.uuid}`}
						onPress={() => void switchUser(credential)}
						leading={
							<RecordAvatar
								record={credential}
								avatarUrl={credential.avatar_url}
								name={credential.display_name}
								size="md"
							/>
						}
						label={credential.display_name}
					/>
				))}
		</>
	);
}

export function UserSheet({
	open,
	onOpenChange,
	onSwitchRegister,
	portalHost = 'pos',
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSwitchRegister?: () => void;
	portalHost?: string | null;
}) {
	const { site, wpCredentials, logout } = useStoreSession();
	const displayName = useDocField(wpCredentials, (value) => value.display_name) as string;
	// The register bar's condition for its store switch: more than one store on this login.
	const stores = useDocField(wpCredentials, (value) => value.stores) as string[] | undefined;
	const [storeOpen, setStoreOpen] = React.useState(false);
	const side = usePanelSide('shell');
	const { registers } = useRegisterBinding();
	const currentOrder = useCurrentOrderOptional();
	// The rail is outside CurrentOrderProvider; no shared selection exists yet (ADR 0030).
	const attributed = !currentOrder || isCartAttributed(currentOrder.payload);
	const t = useT();
	const router = useRouter();
	return (
		<>
			<ClearLocalData
				trigger={(handleResetPress) => (
					<Dialog open={open} onOpenChange={onOpenChange}>
						<DialogContent
							side={side}
							size="lg"
							portalHost={portalHost ?? undefined}
							testID="user-sheet"
						>
							<DialogHeader>
								<DialogTitle>{displayName}</DialogTitle>
							</DialogHeader>
							{open && (
								<ScrollView contentContainerClassName="grow px-4 pb-4">
									<SalesToday />
									<View testID="user-sheet-switch-user">
										<Text className="min-h-row py-3">{t('register.switch_user')}</Text>
										<Suspense>
											<UserRows />
										</Suspense>
										<AddUserButton site={site} hasExistingUsers compact />
									</View>
									{registers.length > 1 && onSwitchRegister && (
										<MenuRow
											testID="user-sheet-switch-register"
											disabled={attributed}
											aria-disabled={attributed}
											onPress={() => {
												onOpenChange(false);
												onSwitchRegister();
											}}
											label={t('register.switch_register')}
											description={
												attributed
													? currentOrder
														? t('register.switch_register_blocked_cart')
														: t('register.switch_register_unavailable_here')
													: undefined
											}
										/>
									)}
									{(stores?.length ?? 0) > 1 && (
										<MenuRow
											testID="user-sheet-switch-store"
											onPress={() => {
												onOpenChange(false);
												setStoreOpen(true);
											}}
											label={t('register.switch_store')}
										/>
									)}
									<View className="mt-auto pt-4">
										<MenuRowSeparator />
										<Button
											testID="user-sheet-sign-out"
											variant="outline-destructive"
											onPress={logout}
										>
											{/* The variant owns the label colour: a red Text here went red-on-red when pressed. */}
											{t('register.sign_out')}
										</Button>
									</View>
									<View className="mt-4 gap-2 pt-4">
										<MenuRowSeparator />
										<MenuRow
											testID="user-sheet-settings"
											onPress={() => {
												onOpenChange(false);
												router.push('/settings');
											}}
											leading={<Icon name="settings" className="text-muted-foreground" />}
											label={t('common.settings')}
										/>
										<MenuRow
											testID="user-sheet-support"
											onPress={() => {
												onOpenChange(false);
												router.push('/support');
											}}
											leading={<Icon name="support" className="text-muted-foreground" />}
											label={t('common.support')}
										/>
										{/* Web only, as the header's menu had them: a browser is where these two go. */}
										{Platform.isWeb && (
											<MenuRow
												testID="user-sheet-wp-admin"
												onPress={() => openExternalURL(`${site.home}/wp-admin`)}
												leading={<Icon name="wordpress" className="text-muted-foreground" />}
												label={t('common.wordpress_admin')}
											/>
										)}
										{Platform.isWeb && (
											<MenuRow
												testID="user-sheet-desktop-app"
												onPress={() =>
													openExternalURL('https://github.com/wcpos/electron/releases')
												}
												leading={<Icon name="download" className="text-muted-foreground" />}
												label={t('common.desktop_app')}
											/>
										)}
										<MenuRow
											testID="user-sheet-clear-local-data"
											onPress={() => {
												onOpenChange(false);
												handleResetPress();
											}}
											variant="destructive"
											leading={<Icon name="delete" />}
											label={t('common.clear_all_local_data')}
										/>
									</View>
								</ScrollView>
							)}
						</DialogContent>
					</Dialog>
				)}
			/>
			<SwitchStoreSheet open={storeOpen} onOpenChange={setStoreOpen} portalHost={portalHost} />
		</>
	);
}
