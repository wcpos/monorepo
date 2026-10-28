import * as React from 'react';
import { View } from 'react-native';

import { useRouter } from 'expo-router';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { defer, filter, firstValueFrom, repeat, startWith, switchMap, timer } from 'rxjs';

import { observeCredentialStores, PENDING_USER_DB_READ } from '@wcpos/query/user-db';
import { Icon } from '@wcpos/components/icon';
import { Platform } from '@wcpos/utils/platform';
import { openExternalURL } from '@wcpos/utils/open-external-url';
import { MenuRow, MenuRowSeparator } from '@wcpos/components/menu-row';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
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
import { RecordAvatar, UserAvatar } from '../../components/user-avatar';
import { usePanelSide } from '../contexts/overlay-side';
import { SwitchStoreSheet } from './switch-store-sheet';
import { useCurrentOrderOptional } from '../contexts/current-order/context';
import { isCartAttributed } from '../../../../services/register-session/cart-attribution';
import { useAwaitingStoreCount } from '../checkout/use-awaiting-store';

/**
 * The sheet is one list: every row, pressable or not, starts at the MenuRow's own inset
 * (`px-2.5`) so the labels share one left edge, and the static rows draw the list's hairline.
 */
const STATIC_ROW =
	'min-h-row border-border flex-row items-center justify-between gap-2 border-b px-2.5';

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
		<View testID="user-sheet-sales-today" className={STATIC_ROW}>
			<Text>{t('register.your_sales_today')}</Text>
			<Text className="tabular-nums">{format(total)}</Text>
		</View>
	);
}

/**
 * ADR 0040 Decided 1 rule 1: the cashier is never unaware of a sale the store has not heard.
 * The money journal is per cashier (the store database is keyed by credential), so per Paul's
 * 2026-10-23 ruling a deferred sale is sent only by its own cashier's session, never under
 * another. This sheet is where a switch or sign-out happens, so it tells the cashier who holds it.
 */
function AwaitingStore() {
	const count = useAwaitingStoreCount();
	const t = useT();
	if (count === 0) return null;
	return (
		<View testID="user-sheet-awaiting-store" className="border-border gap-1 border-b px-2.5 py-3">
			<View className="flex-row items-center justify-between gap-2">
				<Text>{t('register.awaiting_store_label')}</Text>
				<Text className="text-warning-text tabular-nums">
					{t('register.sales_count', { count })}
				</Text>
			</View>
			<Text className="text-muted-foreground text-sm">
				{t('register.awaiting_store_sent_when_signed_in')}
			</Text>
		</View>
	);
}

/** The sentence-case section heading of the cart ledger (cart LEDGER line 83). */
function SectionHeading({ children }: { children: React.ReactNode }) {
	return (
		<View className="min-h-row justify-center px-2.5">
			<Text className="font-semibold">{children}</Text>
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

/**
 * The cashier's sheet: who is signed in, what they sold today, and the ways to change who
 * or where. The till's money is the register panel's; Settings and Support are the drawer's;
 * this sheet carries no second copy of either (Paul, 2026-10-23).
 */
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
	const externalGlyph = <Icon name="openExternal" size="sm" className="text-muted-foreground" />;
	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent
					side={side}
					size="lg"
					portalHost={portalHost ?? undefined}
					testID="user-sheet"
				>
					<DialogHeader className="flex-row items-center gap-3">
						<UserAvatar wpCredentials={wpCredentials} displayName={displayName} />
						<DialogTitle className="min-w-0 flex-1" numberOfLines={1}>
							{displayName}
						</DialogTitle>
					</DialogHeader>
					{open && (
						<DialogBody className="gap-0">
							<SalesToday />
							<AwaitingStore />
							<View testID="user-sheet-switch-user">
								<SectionHeading>{t('register.switch_user')}</SectionHeading>
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
									leading={<Icon name="register" className="text-muted-foreground" />}
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
									leading={<Icon name="store" className="text-muted-foreground" />}
									label={t('register.switch_store')}
								/>
							)}
							{/* A browser is where these two go: the desktop app has no admin tab to open, and
							    already is the desktop app. */}
							{Platform.isWeb && (
								<>
									<MenuRowSeparator />
									<MenuRow
										testID="user-sheet-wp-admin"
										onPress={() => openExternalURL(`${site.url}/wp-admin`)}
										leading={<Icon name="wordpress" className="text-muted-foreground" />}
										label={t('common.wordpress_admin')}
										trailing={externalGlyph}
									/>
									<MenuRow
										testID="user-sheet-desktop-app"
										onPress={() => openExternalURL('https://github.com/wcpos/electron/releases')}
										leading={<Icon name="desktop" className="text-muted-foreground" />}
										label={t('common.desktop_app')}
										trailing={externalGlyph}
									/>
								</>
							)}
						</DialogBody>
					)}
					<DialogFooter
						destructive={{
							label: t('register.sign_out'),
							testID: 'user-sheet-sign-out',
							onPress: () => void logout(),
						}}
					/>
				</DialogContent>
			</Dialog>
			<SwitchStoreSheet open={storeOpen} onOpenChange={setStoreOpen} portalHost={portalHost} />
		</>
	);
}
