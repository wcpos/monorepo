import * as React from 'react';
import { View } from 'react-native';

import { format as formatDate } from 'date-fns/format';
import { useRouter } from 'expo-router';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { defer, filter, firstValueFrom, repeat, startWith, switchMap, timer } from 'rxjs';

import {
	CarryAdoptionError,
	carryDrawer,
	observeRegister$,
	readLiveSession,
} from '@wcpos/query/register-session';
import { observeCredentialStores, PENDING_USER_DB_READ } from '@wcpos/query/user-db';
import { AmountFigure } from '@wcpos/components/amount-figure';
import { Avatar, getInitials } from '@wcpos/components/avatar';
import { PressableSurface } from '@wcpos/components/pressable-surface';
import { Icon } from '@wcpos/components/icon';
import { IconButton } from '@wcpos/components/icon-button';
import { PropertyList, PropertyRow, PropertyVerb } from '@wcpos/components/property-row';
import { ToneDisc } from '@wcpos/components/tone-disc';
import { Platform } from '@wcpos/utils/platform';
import { openExternalURL } from '@wcpos/utils/open-external-url';
import { Loader } from '@wcpos/components/loader';
import { Portal } from '@wcpos/components/portal';
import type { ReadonlyWpCredentialsRecord } from '@wcpos/query/user-db';
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
import { Toast } from '@wcpos/components/toast';
import { requestStateManager } from '@wcpos/hooks/use-http-client/request-state-manager';
import { observeCashierSalesTotal, useDocField, useQueryRuntime } from '@wcpos/query';
import { log } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';

import { FigureTile } from './figure-tile';
import { SwitchConfirm, type SwitchRequest } from './switch-confirm';
import { usePaymentInFlight } from '../checkout/payments/payment-in-flight';
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
import { useSwitchStore } from './use-switch-store';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';
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
	return useObservableState(sales$, { total: 0, count: 0 });
}

export function SalesTile({ sub }: { sub?: string }) {
	const { total } = useSalesToday();
	const { format } = useCurrencyFormat();
	const t = useT();
	return (
		<FigureTile
			testID="user-sheet-sales-today"
			label={t('register.your_sales_today')}
			value={format(total)}
			sub={sub}
		/>
	);
}

function useDrawerFigure(registerName?: string | null) {
	const { format } = useCurrencyFormat();
	const { session, expected, lastClosure, blind, salesCount, binding, figuresPending } =
		useRegisterSession();
	const { site } = useStoreSession();
	const credentials = useObservableSuspense(credentialsListResource(site));
	const opener = credentials.find((row) => row.id === session?.opened_by);
	const { timezone } = useStoreDay();
	const t = useT();
	const amount = figuresPending
		? '—'
		: blind
			? t('register.sales_count', { count: salesCount })
			: format(Number(expected.cash ?? 0));
	const closedLine = t('register.register_closed_last_closure', {
		// Prefer the store's acknowledged number over the provisional offline number.
		n: lastClosure?.server_number ?? lastClosure?.number ?? '—',
	});
	const openerLine =
		session &&
		(figuresPending ? (
			<Text variant="key">{t('register.figures_after_sync')}</Text>
		) : (
			<View className="flex-row items-center gap-1">
				<Text variant="key">
					{registerName ? `${registerName} · ` : ''}
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
		));
	return {
		visible: binding.status === 'bound' && !!(session || lastClosure),
		figure: session ? <AmountFigure size="tile">{amount}</AmountFigure> : <Text>{closedLine}</Text>,
		openerLine,
	};
}

export function DrawerTile({ label }: { label: string }) {
	const { visible, figure, openerLine } = useDrawerFigure();
	if (!visible) return null;
	return (
		<View testID="user-sheet-drawer" className="border-border flex-1 rounded-lg border px-3 py-2.5">
			<Text variant="key">{label}</Text>
			{figure}
			{openerLine}
		</View>
	);
}

function DrawerDoor({ onOpen, busy }: { onOpen: () => void; busy: boolean }) {
	const { registers, registerName } = useRegisterBinding();
	const { visible, figure, openerLine } = useDrawerFigure(
		registers.length > 1 ? registerName : undefined
	);
	const { session, countingHere, countingBy } = useRegisterSession();
	const { timezone } = useStoreDay();
	const t = useT();
	if (!visible) return null;
	const verbs = countingHere
		? t('register.drawer_counting_back', {
				time: countingBy?.at
					? formatDate(convertUTCStringToLocalDate(countingBy.at), 'HH:mm', zoneOptions(timezone))
					: '—',
			})
		: session
			? t('register.drawer_verbs')
			: t('register.drawer_closed_verbs');
	return (
		<PressableSurface
			testID="user-sheet-drawer"
			onPress={onOpen}
			disabled={busy}
			wash="accent"
			className="border-border rounded-lg border"
		>
			<View className="flex-row items-center gap-3 px-3 py-2.5">
				<ToneDisc tone="muted" icon="register" size="sm" />
				<View className="min-w-0 flex-1">
					<Text variant="key">{t('register.in_the_drawer_tile')}</Text>
					{openerLine}
				</View>
				{figure}
			</View>
			<View
				testID="user-sheet-drawer-verbs"
				className="border-border flex-row items-center justify-between border-t px-3 py-2"
			>
				<Text variant="link">{verbs}</Text>
				<Icon name="chevronRight" className="text-primary" />
			</View>
		</PressableSurface>
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

function UserRows({
	busy,
	hold,
	counting,
	onChoose,
}: {
	busy: boolean;
	hold: boolean;
	counting: boolean;
	onChoose: (request: SwitchRequest) => void;
}) {
	const { site, wpCredentials } = useStoreSession();
	const credentials = useObservableSuspense(credentialsListResource(site));

	return (
		<>
			{credentials
				.filter((credential) => credential.uuid !== wpCredentials.uuid)
				.map((credential) => (
					<MenuRow
						key={credential.uuid}
						testID={`user-sheet-user-${credential.uuid}`}
						disabled={busy || hold || counting}
						onPress={() => onChoose({ kind: 'cashier', credential })}
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

function StoreRows({
	busy,
	hold,
	online,
	onChoose,
}: {
	busy: boolean;
	hold: boolean;
	online: boolean;
	onChoose: (request: SwitchRequest) => void;
}) {
	const { wpCredentials, store } = useStoreSession();
	const stores = useObservableSuspense(storeListResource(wpCredentials));
	const t = useT();
	if (stores.length <= 1) return null;
	return (
		<View testID="user-sheet-store-band">
			{stores.map((row) => (
				<MenuRow
					key={row.localID}
					testID={`user-sheet-store-${row.localID}`}
					choice
					selected={row.localID === store.localID}
					disabled={row.localID === store.localID || busy || hold || !online}
					description={
						row.localID !== store.localID && !hold && !online
							? t('register.needs_store_to_switch')
							: undefined
					}
					onPress={
						row.localID === store.localID || busy || hold || !online
							? undefined
							: () => onChoose({ kind: 'store', store: row })
					}
					label={row.name}
				/>
			))}
		</View>
	);
}

function RegisterRows({
	attributed,
	reason,
	busy,
	hold,
	onChoose,
}: {
	attributed: boolean;
	reason: string;
	busy: boolean;
	hold: boolean;
	onChoose: (request: SwitchRequest) => void;
}) {
	const { userDB, site } = useStoreSession();
	const { registers, registerId, refresh } = useRegisterBinding();
	// The directory keeps its loaded answer until asked again; the band asks on every opening,
	// as the picker did, so another till's open, close or count reaches the rows (Codex, #3045).
	React.useEffect(() => {
		void refresh();
	}, [refresh]);
	const register$ = React.useMemo(() => observeRegister$(userDB), [userDB]);
	const device = useObservableState(register$);
	const { countingBy } = useRegisterSession();
	const { timezone } = useStoreDay();
	const t = useT();
	return (
		<View testID="user-sheet-register-band">
			{registers.map((row) => {
				const cached = device?.sites[site.uuid!]?.registers?.[row.id];
				const live = cached ? cached.live : (readLiveSession(site.uuid!, row.id) ?? row.session);
				const description =
					live?.status === 'counting'
						? row.id === registerId && countingBy
							? t('register.counting_by_since', {
									name: countingBy.name ?? t('register.unknown_cashier'),
									time: countingBy.at
										? formatDate(
												convertUTCStringToLocalDate(countingBy.at),
												'HH:mm',
												zoneOptions(timezone)
											)
										: '—',
								})
							: t('register.counting_short')
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
						description={attributed && !hold ? reason : description}
						disabled={row.id === registerId || attributed || busy || hold}
						onPress={
							row.id === registerId || attributed || busy || hold
								? undefined
								: () =>
										onChoose({ kind: 'register', register: row, state: description, open: !!live })
						}
					/>
				);
			})}
		</View>
	);
}

/** The Store fact row: the current store, and Switch only when the login has more than one. */
function StoreRow({
	busy,
	paying,
	online,
	storeName,
	onSwitch,
}: {
	busy: boolean;
	paying: boolean;
	online: boolean;
	storeName?: string;
	onSwitch: () => void;
}) {
	const { wpCredentials } = useStoreSession();
	// Suspends until the list answers, inside its own boundary so the sheet never blanks (#3045's rule).
	const stores = useObservableSuspense(storeListResource(wpCredentials));
	const t = useT();
	return (
		<PropertyRow
			id="store"
			label={t('register.store')}
			help={
				stores.length > 1 && !online && !paying ? t('register.needs_store_to_switch') : undefined
			}
			verb={
				stores.length > 1 && (
					<PropertyVerb
						testID="user-sheet-store-switch"
						disabled={busy || paying || !online}
						onPress={onSwitch}
					>
						{t('common.switch')}
					</PropertyVerb>
				)
			}
		>
			<Text>{storeName}</Text>
		</PropertyRow>
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
	onOpenRegister?: (pane?: 'register' | 'count') => void;
	portalHost?: string | null;
}) {
	const { site, store, storeDB, userDB, wpCredentials, logout } = useStoreSession();
	const http = useRestHttpClient();
	const { login } = useAppState();
	const router = useRouter();
	const [request, setRequest] = React.useState<SwitchRequest | null>(null);
	const [pane, setPane] = React.useState<'sheet' | 'store' | 'register'>('sheet');
	const { total } = useSalesToday();
	const { format } = useCurrencyFormat();
	const paying = usePaymentInFlight();
	const { countingHere, session, loaded, actions, binding } = useRegisterSession();
	const online = useOnlineStatus().status === 'online-website-available';
	const displayName = useDocField(wpCredentials, (value) => value.display_name) as string;
	const { handleSwitchStore, isSwitching } = useSwitchStore();
	// One action at a time: a cashier switch or a register bind in flight holds the store band as
	// the store switch holds them, so a later tap never commits a login or a binding against the
	// store the earlier one is replacing (CodeRabbit, #3045).
	const [acting, setActing] = React.useState(false);
	const busy = isSwitching || acting;
	const act = async (work: () => Promise<void>) => {
		setActing(true);
		try {
			await work();
		} finally {
			setActing(false);
			setPane('sheet');
		}
	};
	// The cashier sheet comes from the right on every screen, the POS included (Paul, 2026-10-30:
	// one door, one side; this reverses the 10-28 map's products-side rule for the sheet only).
	const side = 'right';
	const { registers, registerName, status, bind } = useRegisterBinding();
	const lastAccess = useDocField(wpCredentials, (value) => value.last_access);
	// The credential copies `last_access` as the server sent it; an unreadable stamp drops the time.
	const signedInAt = lastAccess ? new Date(lastAccess) : null;
	const signedIn = signedInAt && !Number.isNaN(signedInAt.getTime()) ? signedInAt : null;
	const storeName = useDocField(store, (value) => value.name);
	const { timezone } = useStoreDay();
	const currentOrder = useCurrentOrderOptional();
	// A page bar is outside CurrentOrderProvider; no shared selection exists yet (ADR 0030).
	const attributed = !currentOrder || isCartAttributed(currentOrder.payload);
	const t = useT();
	const reason = currentOrder
		? t('register.switch_register_blocked_cart')
		: t('register.switch_register_unavailable_here');
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
	const openRegister = (pane: 'register' | 'count' = 'register') => {
		onOpenRegister?.(pane);
		setPane('sheet');
		onOpenChange(false);
	};
	const run = (request: SwitchRequest) => {
		switch (request.kind) {
			case 'cashier':
				return void act(() => switchUser(request.credential));
			case 'store':
				return void act(async () => {
					if (request.carry) {
						try {
							await carryDrawer({
								http,
								storeDB,
								userDB,
								siteUuid: site.uuid!,
								sessionId: session!.id,
								fromRegisterId: binding.registerId!,
								from: { id: store.id!, name: store.name ?? '' },
								to: request.carry,
							});
						} catch (error) {
							// The server carried: the drawer is in Y and the next cycle records it; switch.
							const carried = error instanceof CarryAdoptionError;
							Toast.show({
								text1: carried ? t('common.carry_recorded_later') : t('common.carry_failed'),
								type: carried ? 'warning' : 'error',
							});
							log.error('Drawer carry failed', {
								code: ERROR_CODES.REGISTER_CARRY_FAILED,
								context: { error, carried },
							});
							if (!carried) return;
						}
					}
					if (await handleSwitchStore(request.store)) onOpenChange(false);
				});
			case 'register':
				return void act(() => bind(request.register.id));
			case 'sign-out':
				// The count first, the panel only once it started: a refusal (figures turned pending,
				// the session gone) keeps the sheet and says so, as the register panel's own button
				// does (CodeRabbit, #3056).
				return void act(async () => {
					try {
						await actions.startCounting();
					} catch (error) {
						log.error('The count could not start', {
							code: ERROR_CODES.REGISTER_CLOSE_REFUSED,
							showToast: true,
							context: { error },
						});
						return;
					}
					openRegister('count');
				});
		}
	};
	const externalGlyph = <Icon name="openExternal" size="sm" className="text-muted-foreground" />;
	return (
		<>
			<Dialog
				open={open}
				onOpenChange={(next) => {
					if (!next && busy) return;
					if (!next) setPane('sheet');
					onOpenChange(next);
				}}
			>
				<DialogContent
					side={side}
					size="lg"
					portalHost={portalHost ?? undefined}
					testID="user-sheet"
				>
					{pane !== 'sheet' ? (
						<DialogHeader className="flex-row items-center gap-3">
							<IconButton
								name="chevronLeft"
								testID="user-sheet-pane-back"
								accessibilityLabel={t('common.back')}
								onPress={() => setPane('sheet')}
							/>
							<DialogTitle>
								{pane === 'store' ? t('register.switch_store') : t('register.switch_register')}
							</DialogTitle>
						</DialogHeader>
					) : (
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
					)}
					{open && pane === 'sheet' && (
						<DialogBody className="gap-0">
							<Suspense>
								<View
									testID="user-sheet-sales-today"
									className="flex-row items-center justify-between px-3 py-2.5"
								>
									<Text variant="key">{t('register.your_sales_today')}</Text>
									<AmountFigure size="tile">{format(total)}</AmountFigure>
								</View>
								<DrawerDoor
									busy={busy}
									onOpen={() => openRegister(countingHere ? 'count' : 'register')}
								/>
							</Suspense>
							<AwaitingStore />
							{paying && (
								<Notice
									tone="info"
									testID="user-sheet-hold"
									title={t('register.finish_payment_first')}
								/>
							)}
							<View testID="user-sheet-switch-user">
								<View className="h-band border-border mt-2 flex-row items-center justify-between border-b px-2.5">
									<Text variant="caption">{t('register.hand_the_till_to')}</Text>
									{countingHere && !paying && (
										<Text variant="key">{t('register.finish_count_first')}</Text>
									)}
								</View>
								<Suspense>
									<UserRows
										busy={busy}
										hold={paying}
										counting={countingHere}
										onChoose={setRequest}
									/>
								</Suspense>
								{/* Every session-changing action is inert while a store switch hydrates: the overlay
								    covers the pointer, not the keyboard, and a sign-out mid-switch would be undone
								    when the switch publishes its session (Codex, #3045). */}
								{online && !busy && !paying && (
									<AddUserButton site={site} hasExistingUsers compact />
								)}
							</View>
							<View className="mt-2">
								<PropertyList prefix="user-sheet">
									<Suspense>
										<StoreRow
											busy={busy}
											paying={paying}
											online={online}
											storeName={storeName}
											onSwitch={() => setPane('store')}
										/>
									</Suspense>
									{status === 'bound' && registers.length > 1 && (
										<PropertyRow
											id="register"
											label={t('register.register')}
											help={attributed && !paying ? reason : undefined}
											verb={
												<PropertyVerb
													testID="user-sheet-register-switch"
													disabled={attributed || busy || paying}
													onPress={() => setPane('register')}
												>
													{t('common.switch')}
												</PropertyVerb>
											}
										>
											<Text>{registerName}</Text>
										</PropertyRow>
									)}
								</PropertyList>
							</View>
						</DialogBody>
					)}
					{open && pane !== 'sheet' && (
						<DialogBody>
							<Suspense>
								{pane === 'store' ? (
									<StoreRows busy={busy} hold={paying} online={online} onChoose={setRequest} />
								) : (
									<RegisterRows
										attributed={attributed}
										reason={reason}
										busy={busy}
										hold={paying}
										onChoose={setRequest}
									/>
								)}
							</Suspense>
						</DialogBody>
					)}
					{open && pane === 'sheet' && Platform.isWeb && (
						<View
							testID="user-sheet-foot"
							className="border-border flex-row items-center gap-4 border-t px-4 py-2"
						>
							<PressableSurface
								testID="user-sheet-wp-admin"
								minTarget
								wash="none"
								className="flex-row items-center gap-1"
								onPress={() => openExternalURL(`${site.url}/wp-admin`)}
							>
								{externalGlyph}
								<Text variant="key">{t('common.wordpress_admin')}</Text>
							</PressableSurface>
							<PressableSurface
								testID="user-sheet-desktop-app"
								minTarget
								wash="none"
								className="flex-row items-center gap-1"
								onPress={() => openExternalURL('https://github.com/wcpos/electron/releases')}
							>
								{externalGlyph}
								<Text variant="key">{t('common.desktop_app')}</Text>
							</PressableSurface>
						</View>
					)}
					<DialogFooter
						destructive={
							pane !== 'sheet'
								? undefined
								: {
										label: t('register.sign_out'),
										testID: 'user-sheet-sign-out',
										// A bound register whose session has not loaded is not closed; Sign out waits for
										// the answer rather than skipping the question (Codex, #3056).
										disabled: busy || paying || (binding.status === 'bound' && !loaded),
										// Only a session that is still open or being counted is one to close first: the hook
										// also returns a closed session whose closure write was interrupted, and Close
										// register would reopen it (Codex, #3056).
										onPress: () =>
											binding.status === 'bound' && session && session.status !== 'closed'
												? setRequest({ kind: 'sign-out' })
												: void act(() => logout()),
									}
						}
					/>
				</DialogContent>
				<SwitchConfirm
					request={request}
					portalHost={portalHost ?? undefined}
					onOpenChange={(o) => {
						if (!o) setRequest(null);
					}}
					onConfirm={run}
					onSignOutAnyway={() => void act(() => logout())}
				/>
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
