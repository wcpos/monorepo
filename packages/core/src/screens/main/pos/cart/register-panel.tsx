import * as React from 'react';
import { View } from 'react-native';

import { format as formatDate } from 'date-fns/format';
import { useObservableSuspense } from 'observable-hooks';

import { AmountFigure } from '@wcpos/components/amount-figure';
import { Badge } from '@wcpos/components/badge';
import { Icon } from '@wcpos/components/icon';
import { Button, ButtonText } from '@wcpos/components/button';
import { Derivation, DerivationLine, DerivationStep } from '@wcpos/components/derivation';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { cn } from '@wcpos/components/lib/utils';
import { MenuRow } from '@wcpos/components/menu-row';
import { Notice } from '@wcpos/components/notice';
import { ToneDisc } from '@wcpos/components/tone-disc';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';
import { getErrorCodeDocURL } from '@wcpos/utils/logger/constants';
import { isLiveMovement, readCarriedFrom } from '@wcpos/query/register-session';
import { fromMinor, toMinor } from '@wcpos/order-math';

import { credentialsListResource } from '../../../../hooks/user-db-list-resources';
import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { usePaymentMethods } from '../../hooks/use-payment-methods';
import { ClosurePanel } from '../../reports/closures/closure-panel';
import { useStoreDayLabel } from '../../../../hooks/use-store-day-label';
import { RegisterCount } from './register-count';
import { mayAbandonCount } from '../../../../services/register-session/count-decision';
import { RefusedCloseNotice } from './refused-close-notice';
import { ageLabel } from './register-bar.helpers';
import { Ticking } from './ticking';
import { useStoreDay, zoneOptions } from '../../../../hooks/use-store-day';
import { convertUTCStringToLocalDate } from '../../../../hooks/use-local-date';
import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import { MovementSheet } from './movement-sheet';
import { useSessionReport } from '../../../../services/register-session/use-session-report';
import { PrintSheet } from '../../receipt/print-sheet';
import { type ClosureCount, ClosureWritten } from './closure-written';

const STATIC_ROW =
	'min-h-row border-border flex-row items-center justify-between gap-2 border-b px-2.5';
const NOTE_INSET = 'px-2.5 py-1';

export function RegisterPanel({
	open,
	onOpenChange,
	initialPane = 'register',
}: {
	open: boolean;
	initialPane?: 'register' | 'count';
	onOpenChange: (open: boolean) => void;
}) {
	const {
		session,
		loaded,
		binding,
		expected,
		terms,
		salesCount,
		blind,
		figuresPending,
		countingHere,
		overdue,
		closeTime,
		movements,
		refusedMovements,
		refusedClose,
		lastClosure,
		actions,
		canManageCash,
	} = useRegisterSession();
	const [movement, setMovement] = React.useState<'paid_in' | 'paid_out' | 'no_sale' | null>(null);
	const [error, setError] = React.useState('');
	// This device's own count, or a close awaiting its closure write, opens on the count pane;
	// so does a close the store refused (#2016), whose count mark the close already cleared.
	const landing =
		canManageCash &&
		((session?.status === 'counting' && (countingHere || refusedClose)) ||
			session?.status === 'closed')
			? 'count'
			: 'register';
	const [pane, setPane] = React.useState<'register' | 'closure' | 'count' | 'written'>(landing);
	const [ledgerOpen, setLedgerOpen] = React.useState(false);
	const [othersOpen, setOthersOpen] = React.useState(false);
	// Off the till, the panel mounts open before its session has loaded (Codex, #3091).
	const [opening, setOpening] = React.useState({ open, initialPane, loaded });
	if (open !== opening.open || initialPane !== opening.initialPane || loaded !== opening.loaded) {
		setOpening({ open, initialPane, loaded });
		if (open) setPane(landing);
	}
	const [written, setWritten] = React.useState<ClosureCount | null>(null);
	// A refusal that lands after the local write leaves the written pane (#2016). It is the
	// change that counts: a retry's write can finish while the last refusal still reads true.
	const [wasRefused, setWasRefused] = React.useState(refusedClose);
	if (refusedClose !== wasRefused) {
		setWasRefused(refusedClose);
		if (refusedClose && pane === 'written') {
			setPane(landing);
			setWritten(null);
		}
	}
	const [countBusy, setCountBusy] = React.useState(false);
	const { format } = useCurrencyFormat();
	const { print, doc } = useSessionReport();
	const [sheetOpen, setSheetOpen] = React.useState(false);
	// The sheet shows only its own print failure, never a panel action's leftover message.
	const [printError, setPrintError] = React.useState('');
	const t = useT();
	const movementNames = {
		paid_in: t('register.paid_in'),
		paid_out: t('register.paid_out'),
		no_sale: t('register.no_sale'),
	};
	const { store, site } = useStoreSession();
	const source =
		session?.float_source === 'carried'
			? readCarriedFrom(site.uuid!, binding.registerId!, session.id)
			: null;
	const credentials = useObservableSuspense(credentialsListResource(site));
	const { registers } = useRegisterBinding();
	const { heading, time } = useStoreDayLabel(store.id);
	const { timezone } = useStoreDay();
	// The closure pane is the owner's ledger (§ 7): a blind cashier's row is held, with its note.
	const reportsDenied = blind;
	// The register panel opens from the right on every screen, as the cashier sheet does; what it
	// opens (count, approval, movements, print sheet) follows its side (Paul 2026-10-30: "Cashier
	// and Register modal come from the right, but not every modal").
	const side = 'right';
	// The panel stays mounted while closed (register-bar.tsx), so closing clears what an opening
	// left behind: a failed action's line and a movement in flight.
	const close = (next: boolean) =>
		void attempt(async () => {
			// ×, Escape and an outside tap wait for a close in flight: resuming selling under it
			// would write `open` over the closed session.
			if (!next && countBusy) return;
			if (!next && pane === 'count' && mayAbandonCount(session, refusedClose))
				await actions.backToSelling();
			if (!next) {
				setPane('register');
				setLedgerOpen(false);
				setOthersOpen(false);
				setMovement(null);
				setError('');
			}
			onOpenChange(next);
		});
	// The store's own name for each tender (the gateway title), never its id: the drawer
	// lists what the cashier took money as, and `stripe_terminal_for_woocommerce` is not that.
	// The same fallback as the closure document for a method the store no longer advertises.
	const { byId } = usePaymentMethods();
	const tenderLabel = (method: string) =>
		byId.get(method)?.title ?? method.charAt(0).toUpperCase() + method.slice(1);
	// Money out of the drawer reads as a minus (U+2212), never as a colour: it is not destructive.
	const minus = (amount: string | number) =>
		Number(amount) ? `\u2212${format(Math.abs(Number(amount)))}` : format(0);
	const attempt = async (action: () => Promise<unknown>) => {
		try {
			await action();
		} catch (e) {
			setError(
				e instanceof Error && e.message === 'reports.reprint_failed'
					? t('reports.reprint_failed')
					: String(e)
			);
		}
	};
	// Opening is an external request, not a subscription to changes during a count.
	const openPane = React.useEffectEvent(() => {
		if (canManageCash && initialPane === 'count' && session?.status === 'open' && !figuresPending)
			void attempt(async () => {
				await actions.startCounting();
				setPane('count');
			});
	});
	React.useEffect(() => {
		// eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- The external opening requests the existing async count transition.
		if (open) openPane();
	}, [open, initialPane, loaded]);
	// Refused cash keeps the pane open on its own: it is the only record that the money moved,
	// so it must not depend on there also being a current session or a written closure.
	if (!session && !lastClosure && !written && refusedMovements.length === 0) return null;
	const activeMovements = movements.filter((row) => isLiveMovement(row, movements));
	// A movement the server refused is cash in the drawer that the ledger will never show.
	// Nothing in this pane used to read sync_status, so it went missing in silence. The list
	// comes from the hook already scoped to this register and NOT to the current session, so
	// the banner survives the close that would otherwise hide the last record of the cash.
	const refused = refusedMovements;
	const closeForbidden = session?.sync_error === 'rest_forbidden';
	// Refused cash alone can open the panel (no session, no closure): then there is no stamp.
	const stamp = session?.opened_at_gmt ?? lastClosure?.closed_at;
	const openedDate = stamp ? convertUTCStringToLocalDate(stamp) : undefined;
	const openedTime = openedDate
		? formatDate(openedDate, 'HH:mm', zoneOptions(timezone))
		: undefined;
	const paidIn = terms
		? fromMinor(
				terms.paidIn.reduce((sum, row) => sum + toMinor(row.amount, 4), 0),
				4
			)
		: '0';
	const others = Object.entries(expected).filter(
		([method, amount]) => method !== 'cash' && Number(amount) !== 0
	);
	const sessionSales =
		Number(terms?.cashSales.amount ?? 0) -
		Number(terms?.cashRefunds.amount ?? 0) +
		others.reduce((sum, [, amount]) => sum + Number(amount), 0);
	// One scope or no money: an older plugin's baseline carries `server_expected` without
	// `server_terms`, so the cash terms are this device's while the other tenders are the
	// register's; the sum would understate a shared register (Codex, #3059). The count stays.
	const salesMoneyKnown = !session?.server_expected_at || !!session.server_terms;
	const trailing = (value: string) => !blind && <Text className="tabular-nums">{value}</Text>;
	const countedLabel = (term: string, count: number) => t('register.term_count', { term, count });

	const variance = Number(lastClosure?.variance.cash ?? 0);
	const closureBadge = !lastClosure?.synced_rows_at
		? t('register.unsynced')
		: lastClosure.corrections_count
			? t('reports.corrected')
			: variance
				? `${blind ? '' : `${format(Math.abs(variance))} `}${variance < 0 ? t('register.short') : t('register.over')}`
				: t('reports.exact');
	const closureTone =
		!lastClosure?.synced_rows_at || lastClosure.corrections_count
			? 'warning'
			: variance < 0
				? 'bad'
				: 'ok';
	// Only the description ticks, wherever it is shown; the panel never re-renders on the clock.
	const describe = (nowMs: number) =>
		[
			store.name,
			openedTime &&
				(session
					? t('register.open_since', { time: openedTime })
					: t('register.closed_at_time', { time: openedTime })),
			session && openedDate && ageLabel(t, openedDate.getTime(), nowMs),
			session &&
				(credentials.find((row) => row.id === session.opened_by)?.display_name ??
					t('register.unknown_cashier')),
		]
			.filter(Boolean)
			.join(' · ');
	const description = <Ticking>{describe}</Ticking>;
	// Without the cash permission the store refuses every POST, so no action offers one.
	const retryRefused = canManageCash
		? ([
				{
					label: t('register.retry'),
					testID: 'register-panel-retry-refused',
					onPress: () =>
						void attempt(() => Promise.all(refused.map((row) => actions.retryMovement(row.id)))),
				},
			] as const)
		: undefined;
	const voidAction = (id: string) =>
		canManageCash
			? {
					label: t('register.void'),
					testID: `movement-void-${id}`,
					disabled: session?.status !== 'open',
					onPress: () => void attempt(() => actions.voidMovement(id)),
				}
			: undefined;
	if (pane === 'written' && written)
		return (
			<Dialog open={open} onOpenChange={close}>
				<DialogContent side={side} size="lg" testID="register-panel">
					<ClosureWritten count={written} onDone={() => close(false)} />
				</DialogContent>
			</Dialog>
		);
	if (pane === 'count' && session)
		return (
			<Dialog open={open} onOpenChange={close}>
				<DialogContent side={side} size="lg" testID="register-panel">
					<RegisterCount
						side={side}
						description={description}
						onBusyChange={setCountBusy}
						onBack={() => setPane('register')}
						onClosed={(count) => {
							setWritten(count);
							setPane('written');
						}}
					/>
				</DialogContent>
			</Dialog>
		);
	if (pane === 'closure' && lastClosure)
		return (
			<Dialog open={open} onOpenChange={close}>
				<DialogContent side={side} size="lg" testID="register-panel">
					<ClosurePanel
						row={lastClosure}
						onBack={() => setPane('register')}
						onClose={() => close(false)}
					/>
				</DialogContent>
			</Dialog>
		);

	return (
		<Dialog open={open} onOpenChange={close}>
			<DialogContent side={side} size="lg" testID="register-panel">
				<DialogHeader className="flex-row items-center gap-3">
					<ToneDisc tone="muted" icon="register" size="sm" testID="register-panel-disc" />
					<View className="min-w-0 flex-1">
						<DialogTitle numberOfLines={1}>
							{registers.length === 1 ? t('register.register') : binding.registerName}
						</DialogTitle>
						<DialogDescription testID="register-panel-description">{description}</DialogDescription>
					</View>
				</DialogHeader>
				{!canManageCash && (
					<Notice
						tone="info"
						testID="register-panel-no-cash-permission"
						className="mx-4"
						title={t('register.no_cash_permission')}
						docs={{ label: t('common.learn_more'), href: getErrorCodeDocURL('REGISTER231') }}
					/>
				)}
				{figuresPending && (
					<Notice
						tone="info"
						testID="register-panel-figures-pending"
						className="mx-4"
						title={t('register.figures_after_sync')}
					/>
				)}
				{refusedClose && session && (canManageCash || !closeForbidden) && (
					<RefusedCloseNotice
						className="mx-4"
						forbidden={closeForbidden}
						onRetry={
							canManageCash
								? () =>
										void attempt(async () => {
											if (session.status === 'open') await actions.startCounting();
											setPane('count');
										})
								: undefined
						}
					/>
				)}
				{refused.length > 0 && (
					<Notice
						tone="bad"
						testID="register-panel-refused"
						className="mx-4"
						title={t('register.refused', { count: refused.length })}
						actions={retryRefused}
					/>
				)}
				{session && (
					<View className="gap-1 px-4">
						{!blind && (
							<View testID="register-panel-drawer">
								<Text className="text-muted-foreground">{t('register.in_the_drawer')}</Text>
								<AmountFigure size="hero">
									{figuresPending ? '—' : format(Number(expected.cash ?? 0))}
								</AmountFigure>
								{figuresPending && (
									<Text className="text-muted-foreground">{t('register.figures_after_sync')}</Text>
								)}
							</View>
						)}
						{/* A seeded session's money is unknown until the baseline arrives (§ 4.9 rule 1); the
						    count is this device's and stays. */}
						<Text testID="register-panel-session-sales" className="text-muted-foreground" tabular>
							{t('register.session_sales')}
							{blind || !salesMoneyKnown ? (
								` · ${t('register.sales_count', { count: salesCount })}`
							) : figuresPending ? (
								` — · ${t('register.figures_after_sync')}`
							) : (
								<>
									{' '}
									<Text className="text-foreground font-semibold tabular-nums">
										{format(sessionSales)}
									</Text>
									{' · '}
									{t('register.sales_count', { count: salesCount })}
								</>
							)}
						</Text>
					</View>
				)}
				{session && canManageCash && (
					<View className="flex-row gap-2 px-4">
						{(['paid_in', 'paid_out', 'no_sale'] as const).map((type) => (
							<Button
								key={type}
								size="stack"
								variant="outline"
								testID={`register-panel-${type.replace('_', '-')}`}
								className="flex-1"
								disabled={session?.status !== 'open'}
								onPress={() => setMovement(type)}
							>
								<Icon
									name={
										type === 'paid_in' ? 'paidIn' : type === 'paid_out' ? 'paidOut' : 'cashDrawer'
									}
								/>
								<ButtonText numberOfLines={2} className="text-center">
									{movementNames[type]}
								</ButtonText>
							</Button>
						))}
					</View>
				)}
				<DialogBody className="gap-0">
					{terms && (
						<>
							<MenuRow
								testID="register-panel-expected"
								label={t('register.expected_in_drawer')}
								aria-expanded={ledgerOpen}
								onPress={() => setLedgerOpen((v) => !v)}
								trailing={
									<>
										{trailing(figuresPending ? '—' : format(Number(terms.expected)))}
										<Icon
											name={ledgerOpen ? 'chevronDown' : 'chevronRight'}
											size="sm"
											className="text-muted-foreground"
										/>
									</>
								}
							/>
							{figuresPending && (
								<Text variant="key" className="px-2.5 py-1">
									{t('register.figures_after_sync')}
								</Text>
							)}
							<Derivation
								testID="register-panel-ledger"
								className={cn('px-4 pt-2', !ledgerOpen && 'hidden')}
							>
								<DerivationStep
									testID="register-panel-float"
									label={t('register.opened_suffix', { time: openedTime })}
									title={t('register.float')}
									trailing={trailing(figuresPending ? '—' : format(Number(terms.float)))}
									detail={
										figuresPending ? (
											t('register.figures_after_sync')
										) : session?.float_source === 'carried' ? (
											<Text testID="register-panel-float-source" variant="key">
												{source
													? t('register.carried_from', { store: source.store_name })
													: t('register.carried')}
											</Text>
										) : undefined
									}
								/>
								{terms.cashSales.count > 0 && (
									<DerivationStep
										label={countedLabel(t('register.cash_sales'), terms.cashSales.count)}
										title={t('register.taken')}
										trailing={trailing(format(Number(terms.cashSales.amount)))}
									/>
								)}
								{Number(terms.cashRefunds.amount) !== 0 && (
									<DerivationStep
										label={countedLabel(t('register.cash_refunds'), terms.cashRefunds.count)}
										trailing={trailing(minus(terms.cashRefunds.amount))}
									/>
								)}
								{(['paid_in', 'paid_out', 'no_sale'] as const).map((type) => {
									const rows = activeMovements.filter((row) => row.type === type);
									const count =
										type === 'paid_in'
											? terms.paidIn.length
											: type === 'paid_out'
												? terms.paidOut.count
												: terms.noSales;
									if (type === 'no_sale' ? !count : !count && !rows.length) return null;
									return (
										<DerivationStep
											key={type}
											testID={
												type === 'paid_in'
													? 'register-panel-paid-in-row'
													: type === 'paid_out'
														? 'register-panel-movements'
														: 'register-panel-no-sales'
											}
											label={countedLabel(movementNames[type], Math.max(count, rows.length))}
											trailing={
												type === 'no_sale'
													? undefined
													: trailing(
															type === 'paid_out'
																? minus(terms.paidOut.amount)
																: format(Number(paidIn))
														)
											}
										>
											{rows.map((row) => (
												<DerivationLine
													key={row.id}
													testID={`movement-row-${row.id}`}
													label={row.reason ?? ''}
													amount={
														blind || type === 'no_sale'
															? undefined
															: type === 'paid_out'
																? minus(row.amount ?? 0)
																: format(Number(row.amount))
													}
													note={
														row.sync_status === 'failed' ? t('register.refused_row') : undefined
													}
													tone={row.sync_status === 'failed' ? 'bad' : undefined}
													action={voidAction(row.id)}
												/>
											))}
										</DerivationStep>
									);
								})}
							</Derivation>
							{others.length > 0 && (
								<>
									{/* A band, not a row: these tenders are not in the drawer. No count: a split
									    sale is both a cash and a card sale, so no subtraction names it honestly. */}
									<MenuRow
										testID="register-panel-other-tenders"
										label={t('register.other_tenders')}
										aria-expanded={othersOpen}
										onPress={() => setOthersOpen((v) => !v)}
										trailing={
											<>
												{trailing(
													// A seeded session's non-cash rows are a part until the baseline arrives: no total yet.
													figuresPending
														? '—'
														: format(others.reduce((sum, [, amount]) => sum + Number(amount), 0))
												)}
												<Icon
													name={othersOpen ? 'chevronDown' : 'chevronRight'}
													size="sm"
													className="text-muted-foreground"
												/>
											</>
										}
									/>
									{others.map(([method, value]) => (
										<View key={method} className={cn(STATIC_ROW, !othersOpen && 'hidden')}>
											<Text className="min-w-0 flex-1">{tenderLabel(method)}</Text>
											{trailing(format(Number(value)))}
										</View>
									))}
								</>
							)}
						</>
					)}
					{lastClosure && (
						<View testID="register-panel-last-closure" className="border-border border-b">
							<MenuRow
								testID="register-panel-open-closure"
								disabled={reportsDenied}
								onPress={() => setPane('closure')}
								label={`${t('reports.closure_n', { n: lastClosure.server_number ?? lastClosure.number })} · ${heading(lastClosure.business_day ?? lastClosure.closed_at)} ${time(lastClosure.closed_at)}${blind ? '' : ` · ${format(Number(lastClosure.counted.cash))}`}`}
								trailing={
									<Badge
										tinted
										size="lg"
										variant={closureTone}
										testID="register-panel-closure-result"
									>
										{closureBadge}
									</Badge>
								}
							/>
							{blind && (
								<Text
									testID="register-panel-closure-restricted"
									variant="key"
									className={NOTE_INSET}
								>
									{t('register.closure_blind_restricted')}
								</Text>
							)}
							{lastClosure.sync_status === 'failed' && (
								<Text testID="closure-sync-error" variant="key" className="text-bad px-2.5 py-1">
									{lastClosure.sync_error}
								</Text>
							)}
						</View>
					)}
					{!!error && !sheetOpen && (
						<Text variant="key" className="text-bad px-2.5 py-2">
							{error}
						</Text>
					)}
				</DialogBody>
				<DialogFooter
					size="lg"
					secondary={{
						label: t('register.print_x_report'),
						testID: 'register-panel-print',
						icon: 'print',
						disabled: blind || !session,
						onPress: () => setSheetOpen(true),
					}}
					intent={
						canManageCash && {
							label: overdue
								? t('register.close_register_past', { time: closeTime })
								: t('register.close_register'),
							testID: 'register-panel-close-register',
							disabled: !session || figuresPending,
							onPress: () =>
								void attempt(async () => {
									await actions.startCounting();
									setPane('count');
								}),
						}
					}
				/>
				<PrintSheet
					open={sheetOpen}
					onOpenChange={setSheetOpen}
					doc={doc}
					title={t('register.x_report')}
					description={
						<Ticking>{(nowMs) => binding.registerName + ' · ' + describe(nowMs)}</Ticking>
					}
					printLabel={t('register.print_x_report')}
					error={printError || doc.documentError?.message || null}
					onPrint={async () => {
						setPrintError('');
						try {
							await print();
						} catch (e) {
							setPrintError(
								e instanceof Error && e.message === 'reports.reprint_failed'
									? t('reports.reprint_failed')
									: String(e)
							);
						}
					}}
					side={side}
					testID="register-panel-print-sheet"
				/>
				{movement && (
					<MovementSheet
						side={side}
						type={movement}
						onOpenChange={(value) => {
							if (!value) setMovement(null);
						}}
						onDone={(id, type, amount) => {
							Toast.show({
								title: `${movementNames[type]}${blind || type === 'no_sale' ? '' : ` ${format(Number(amount))}`}`,
								action: (
									<Button
										testID="toast-undo"
										variant="ghost"
										onPress={() => attempt(() => actions.voidMovement(id))}
									>
										{t('register.undo')}
									</Button>
								),
							});
						}}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
