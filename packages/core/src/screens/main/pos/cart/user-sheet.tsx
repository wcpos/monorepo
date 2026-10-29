import * as React from 'react';
import { View } from 'react-native';

import { format as formatDate } from 'date-fns/format';
import { useRouter, useSegments } from 'expo-router';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { defer, filter, firstValueFrom, repeat, startWith, switchMap, timer } from 'rxjs';

import { observeRegister$, readLiveSession } from '@wcpos/query/register-session';
import { observeCredentialStores, PENDING_USER_DB_READ } from '@wcpos/query/user-db';
import { AmountFigure } from '@wcpos/components/amount-figure';
import { Avatar, getInitials } from '@wcpos/components/avatar';
import { PressableSurface } from '@wcpos/components/pressable-surface';
import { Icon } from '@wcpos/components/icon';
import { Platform } from '@wcpos/utils/platform';
import { openExternalURL } from '@wcpos/utils/open-external-url';
import { Loader } from '@wcpos/components/loader';
import { Portal } from '@wcpos/components/portal';
import type { ReadonlyStoreRecord, ReadonlyWpCredentialsRecord } from '@wcpos/query/user-db';
import { Notice } from '@wcpos/components/notice';
import { MenuRow } from '@wcpos/components/menu-row';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { requestStateManager } from '@wcpos/hooks/use-http-client/request-state-manager';
import { observeCashierSalesTotal, useDocField, useQueryRuntime } from '@wcpos/query';
import { log } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { requestRegisterPanel } from './register-panel-request';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { credentialsListResource } from '../../../../hooks/user-db-list-resources';
import { useAppState, useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import {
	convertLocalDateToUTCString,
	convertUTCStringToLocalDate,
} from '../../../../hooks/use-local-date';
import { useStoreDay, zoneOptions } from '../../../../hooks/use-store-day';
import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import { AddUserButton } from '../../../auth/components/add-user-button';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { RecordAvatar, UserAvatar } from '../../components/user-avatar';
import { usePanelSide } from '../contexts/overlay-side';
import { useSwitchStore } from './use-switch-store';
import { storeListResource } from '../../hooks/store-list-resource';
import { useCurrentOrderOptional } from '../contexts/current-order/context';
import { isCartAttributed } from '../../../../services/register-session/cart-attribution';
import { useAwaitingStoreCount } from '../checkout/use-awaiting-store';

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

function Figures({ onOpen, busy }: { onOpen: () => void; busy: boolean }) {
	const total = useSalesToday();
	const { format } = useCurrencyFormat();
	const { session, expected, lastClosure, blind, salesCount, binding, figuresPending } =
		useRegisterSession();
	const { site } = useStoreSession();
	const credentials = useObservableSuspense(credentialsListResource(site));
	const opener = credentials.find((row) => row.id === session?.opened_by);
	const { timezone } = useStoreDay();
	const t = useT();
	return (
		<View className="flex-row gap-2">
			<View
				testID="user-sheet-sales-today"
				className="border-border flex-1 rounded-lg border px-3 py-2.5"
			>
				<Text variant="key">{t('register.your_sales_today')}</Text>
				<AmountFigure size="tile">{format(total)}</AmountFigure>
			</View>
			{binding.status === 'bound' && (session || lastClosure) && (
				<PressableSurface
					testID="user-sheet-drawer"
					onPress={onOpen}
					disabled={busy}
					className="border-border flex-1 rounded-lg border px-3 py-2.5"
				>
					<Text variant="key">{t('register.in_the_drawer_tile')}</Text>
					{session ? (
						<>
							<AmountFigure size="tile">
								{figuresPending
									? '—'
									: blind
										? t('register.sales_count', { count: salesCount })
										: format(Number(expected.cash ?? 0))}
							</AmountFigure>
							{figuresPending ? (
								<Text variant="key">{t('register.figures_after_sync')}</Text>
							) : (
								<View className="flex-row items-center gap-1">
									<Text variant="key">
										{t('register.opened_at_by', {
											time: formatDate(
												convertUTCStringToLocalDate(session.opened_at_gmt),
												'HH:mm',
												zoneOptions(timezone)
											),
										})}
									</Text>
									<Avatar
										size="sm"
										source={opener?.avatar_url ? { uri: opener.avatar_url } : undefined}
										fallback={getInitials(opener?.display_name ?? t('register.unknown_cashier'))}
									/>
								</View>
							)}
						</>
					) : (
						<Text>
							{t('register.register_closed_last_closure', { n: lastClosure?.number ?? '—' })}
						</Text>
					)}
				</PressableSurface>
			)}
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
		<Notice
			tone="warning"
			testID="user-sheet-awaiting-store"
			title={`${t('register.awaiting_store_label')} · ${t('register.sales_count', { count })}`}
			description={t('register.awaiting_store_sent_when_signed_in')}
		/>
	);
}

function UserRows({ busy }: { busy: boolean }) {
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
			{credentials.map((credential) => (
				<MenuRow
					key={credential.uuid}
					testID={
						credential.uuid === wpCredentials.uuid
							? 'user-sheet-cashier-current'
							: `user-sheet-user-${credential.uuid}`
					}
					choice
					selected={credential.uuid === wpCredentials.uuid}
					disabled={busy}
					onPress={
						credential.uuid === wpCredentials.uuid || busy
							? undefined
							: () => void switchUser(credential)
					}
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

function StoreBand({
	isSwitching,
	onSwitch,
}: {
	isSwitching: boolean;
	onSwitch: (store: ReadonlyStoreRecord) => Promise<void>;
}) {
	const { wpCredentials, store } = useStoreSession();
	const stores = useObservableSuspense(storeListResource(wpCredentials));
	const t = useT();
	if (stores.length <= 1) return null;
	return (
		<View testID="user-sheet-store-band">
			<View className="h-band border-border mt-2 justify-center border-b px-2.5">
				<Text variant="caption">{t('register.store')}</Text>
			</View>
			{stores.map((row) => (
				<MenuRow
					key={row.localID}
					testID={`user-sheet-store-${row.localID}`}
					choice
					selected={row.localID === store.localID}
					disabled={isSwitching}
					onPress={row.localID === store.localID ? undefined : () => void onSwitch(row)}
					label={row.name}
				/>
			))}
		</View>
	);
}

function RegisterBand({
	attributed,
	reason,
	busy,
}: {
	attributed: boolean;
	reason: string;
	busy: boolean;
}) {
	const { userDB, site } = useStoreSession();
	const { registers, registerId, bind, refresh } = useRegisterBinding();
	// The directory keeps its loaded answer until asked again; the band asks on every opening,
	// as the picker did, so another till's open, close or count reaches the rows (Codex, #3045).
	React.useEffect(() => {
		void refresh();
	}, [refresh]);
	const register$ = React.useMemo(() => observeRegister$(userDB), [userDB]);
	const device = useObservableState(register$);
	const { timezone } = useStoreDay();
	const t = useT();
	return (
		<View testID="user-sheet-register-band">
			<View className="h-band border-border mt-2 justify-center border-b px-2.5">
				<Text variant="caption">{t('register.register')}</Text>
			</View>
			{registers.map((row) => {
				const cached = device?.sites[site.uuid!]?.registers?.[row.id];
				const live = cached ? cached.live : (readLiveSession(site.uuid!, row.id) ?? row.session);
				const description =
					live?.status === 'counting'
						? t('register.counting_short')
						: live?.status === 'open'
							? t('register.open_since_name', {
									time: formatDate(
										convertUTCStringToLocalDate(live.opened_at_gmt),
										'HH:mm',
										zoneOptions(timezone)
									),
									name: live.opened_by?.name ?? t('register.unknown_cashier'),
								})
							: t('register.closed_last_closure_short', {
									number: row.last_closure?.number ?? '—',
								});
				return (
					<MenuRow
						key={row.id}
						testID={`user-sheet-register-${row.id}`}
						choice
						selected={row.id === registerId}
						label={row.name}
						description={attributed ? reason : description}
						disabled={attributed || busy}
						onPress={row.id === registerId || busy ? undefined : () => void bind(row.id)}
					/>
				);
			})}
		</View>
	);
}

/**
 * The cashier's sheet: who is signed in, what they sold today, and the ways to change who
 * or where. The drawer figure is the door to its register panel; Settings and Support stay in the drawer.
 */
export function UserSheet({
	open,
	onOpenChange,
	onOpenRegister,
	portalHost = 'pos',
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onOpenRegister?: () => void;
	portalHost?: string | null;
}) {
	const { site, store, wpCredentials, logout } = useStoreSession();
	const router = useRouter();
	const displayName = useDocField(wpCredentials, (value) => value.display_name) as string;
	const { handleSwitchStore, isSwitching } = useSwitchStore();
	// `string[]` as every other reader does: apps/main's typed routes make the tuple's members
	// a union the literal is not assignable to.
	const segments: string[] = useSegments();
	const onPOS = segments.includes('(pos)');
	const cartSide = usePanelSide('cart');
	const side = onPOS ? cartSide : 'right';
	const { registers, registerName, status } = useRegisterBinding();
	const lastAccess = useDocField(wpCredentials, (value) => value.last_access);
	// The credential copies `last_access` as the server sent it; an unreadable stamp drops the time.
	const signedInAt = lastAccess ? new Date(lastAccess) : null;
	const signedIn = signedInAt && !Number.isNaN(signedInAt.getTime()) ? signedInAt : null;
	const storeName = useDocField(store, (value) => value.name);
	const { timezone } = useStoreDay();
	const currentOrder = useCurrentOrderOptional();
	// The rail is outside CurrentOrderProvider; no shared selection exists yet (ADR 0030).
	const attributed = !currentOrder || isCartAttributed(currentOrder.payload);
	const t = useT();
	const externalGlyph = <Icon name="openExternal" size="sm" className="text-muted-foreground" />;
	return (
		<>
			<Dialog
				open={open}
				onOpenChange={(next) => {
					if (!next && isSwitching) return;
					onOpenChange(next);
				}}
			>
				<DialogContent
					side={side}
					size="lg"
					portalHost={portalHost ?? undefined}
					testID="user-sheet"
				>
					<DialogHeader className="flex-row items-center gap-3">
						<UserAvatar wpCredentials={wpCredentials} displayName={displayName} />
						<View className="min-w-0 flex-1">
							<DialogTitle numberOfLines={1}>{displayName}</DialogTitle>
							<DialogDescription testID="user-sheet-description">
								{[
									storeName,
									registers.length > 1 && registerName,
									signedIn &&
										t('register.on_the_till_since', {
											time: formatDate(signedIn, 'HH:mm', zoneOptions(timezone)),
										}),
								]
									.filter(Boolean)
									.join(' · ')}
							</DialogDescription>
						</View>
					</DialogHeader>
					{open && (
						<DialogBody className="gap-0">
							<Suspense>
								<Figures
									busy={isSwitching}
									onOpen={() => {
										if (onOpenRegister) onOpenRegister();
										else {
											router.push('/(app)/(drawer)/(pos)');
											requestRegisterPanel();
										}
										onOpenChange(false);
									}}
								/>
							</Suspense>
							<AwaitingStore />
							<View testID="user-sheet-switch-user">
								<View className="h-band border-border mt-2 justify-center border-b px-2.5">
									<Text variant="caption">{t('register.cashier')}</Text>
								</View>
								<Suspense>
									<UserRows busy={isSwitching} />
								</Suspense>
								{/* Every session-changing action is inert while a store switch hydrates: the overlay
								    covers the pointer, not the keyboard, and a sign-out mid-switch would be undone
								    when the switch publishes its session (Codex, #3045). */}
								{!isSwitching && <AddUserButton site={site} hasExistingUsers compact />}
							</View>
							<Suspense>
								<StoreBand
									isSwitching={isSwitching}
									onSwitch={async (next) => {
										if (await handleSwitchStore(next)) onOpenChange(false);
									}}
								/>
							</Suspense>
							{status === 'bound' && registers.length > 1 && (
								<RegisterBand
									attributed={attributed}
									busy={isSwitching}
									reason={
										currentOrder
											? t('register.switch_register_blocked_cart')
											: t('register.switch_register_unavailable_here')
									}
								/>
							)}
							{/* A browser is where these two go: the desktop app has no admin tab to open, and
							    already is the desktop app. */}
							{Platform.isWeb && (
								<View testID="user-sheet-foot" className="border-border mt-auto border-t">
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
								</View>
							)}
						</DialogBody>
					)}
					<DialogFooter
						destructive={{
							label: t('register.sign_out'),
							testID: 'user-sheet-sign-out',
							disabled: isSwitching,
							onPress: () => void logout(),
						}}
					/>
				</DialogContent>
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
			</Dialog>
		</>
	);
}
