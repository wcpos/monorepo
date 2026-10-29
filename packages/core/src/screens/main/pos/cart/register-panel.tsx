import * as React from 'react';
import { View } from 'react-native';

import { format as formatDate } from 'date-fns/format';
import { useObservableSuspense } from 'observable-hooks';

import { Badge } from '@wcpos/components/badge';
import { Icon } from '@wcpos/components/icon';
import { Button } from '@wcpos/components/button';
import { IconButton } from '@wcpos/components/icon-button';
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
import { MenuRow } from '@wcpos/components/menu-row';
import { Notice } from '@wcpos/components/notice';
import { ToneDisc } from '@wcpos/components/tone-disc';
import { Text } from '@wcpos/components/text';
import { Tile } from '@wcpos/components/tile';
import { Toast } from '@wcpos/components/toast';
import { fromMinor, toMinor } from '@wcpos/order-math';

import { credentialsListResource } from '../../../../hooks/user-db-list-resources';
import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { usePaymentMethods } from '../../hooks/use-payment-methods';
import { usePanelSide } from '../contexts/overlay-side';
import { ClosurePanel } from '../../reports/closures/closure-panel';
import { useStoreDayLabel } from '../../../../hooks/use-store-day-label';
import { RegisterCount } from './register-count';
import { FigureTile } from './figure-tile';
import { useNowMs } from '../../../../hooks/use-relative-time';
import { useStoreDay, zoneOptions } from '../../../../hooks/use-store-day';
import { convertUTCStringToLocalDate } from '../../../../hooks/use-local-date';
import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import { MovementSheet } from './movement-sheet';
import { useSessionReport } from '../../../../services/register-session/use-session-report';
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
		lastClosure,
		actions,
	} = useRegisterSession();
	const [movement, setMovement] = React.useState<'paid_in' | 'paid_out' | 'no_sale' | null>(null);
	const [error, setError] = React.useState('');
	const [pane, setPane] = React.useState<'register' | 'closure' | 'count' | 'written'>(
		session?.status === 'counting' && countingHere ? 'count' : 'register'
	);
	const [opening, setOpening] = React.useState({ open, initialPane });
	if (open !== opening.open || initialPane !== opening.initialPane) {
		setOpening({ open, initialPane });
		if (open) setPane(session?.status === 'counting' && countingHere ? 'count' : 'register');
	}
	const [written, setWritten] = React.useState<ClosureCount | null>(null);
	const { format } = useCurrencyFormat();
	const { print } = useSessionReport();
	const t = useT();
	const movementNames = {
		paid_in: t('register.paid_in'),
		paid_out: t('register.paid_out'),
		no_sale: t('register.no_sale'),
	};
	const { store, site } = useStoreSession();
	const credentials = useObservableSuspense(credentialsListResource(site));
	const { registers } = useRegisterBinding();
	const { heading, time } = useStoreDayLabel(store.id);
	const { timezone } = useStoreDay();
	const nowMs = useNowMs(60_000);
	const ageLabel = (openedMs: number, nowMs: number) => {
		const minutes = Math.max(0, Math.floor((nowMs - openedMs) / 60_000));
		return minutes >= 60
			? t('register.age_h_m', { h: Math.floor(minutes / 60), m: minutes % 60 })
			: t('register.age_m', { m: minutes });
	};
	// The closure pane is the owner's ledger (§ 7): a blind cashier's row is held, with its note.
	const reportsDenied = blind;
	const side = usePanelSide('cart');
	// The panel stays mounted while closed (register-bar.tsx), so closing clears what an opening
	// left behind: a failed action's line and a movement in flight.
	const close = (next: boolean) =>
		void attempt(async () => {
			if (!next && pane === 'count' && session?.status === 'counting')
				await actions.backToSelling();
			if (!next) {
				setPane('register');
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
		if (initialPane === 'count' && session?.status === 'open' && !figuresPending)
			void attempt(async () => {
				await actions.startCounting();
				setPane('count');
			});
	});
	React.useEffect(() => {
		// eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- The external opening requests the existing async count transition.
		if (open) openPane();
	}, [open, initialPane]);
	// Refused cash keeps the pane open on its own: it is the only record that the money moved,
	// so it must not depend on there also being a current session or a written closure.
	if (!session && !lastClosure && !written && refusedMovements.length === 0) return null;
	const activeMovements = movements.filter(
		(row) =>
			row.type !== 'void' && !row.voided_by && !movements.some((entry) => entry.voids === row.id)
	);
	// A movement the server refused is cash in the drawer that the ledger will never show.
	// Nothing in this pane used to read sync_status, so it went missing in silence. The list
	// comes from the hook already scoped to this register and NOT to the current session, so
	// the banner survives the close that would otherwise hide the last record of the cash.
	const refused = refusedMovements;
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
	const description = [
		store.name,
		openedTime &&
			(session
				? t('register.open_since', { time: openedTime })
				: t('register.closed_at_time', { time: openedTime })),
		session && openedDate && ageLabel(openedDate.getTime(), nowMs),
		session &&
			(credentials.find((row) => row.id === session.opened_by)?.display_name ??
				t('register.unknown_cashier')),
	]
		.filter(Boolean)
		.join(' · ');
	if (pane === 'written' && written)
		return (
			<Dialog open={open} onOpenChange={close}>
				<DialogContent side={side} size="lg" portalHost="pos" testID="register-panel">
					<ClosureWritten count={written} onDone={() => close(false)} />
				</DialogContent>
			</Dialog>
		);
	if (pane === 'count' && session)
		return (
			<Dialog open={open} onOpenChange={close}>
				<DialogContent side={side} size="lg" portalHost="pos" testID="register-panel">
					<RegisterCount
						description={description}
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
				<DialogContent side={side} size="lg" portalHost="pos" testID="register-panel">
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
			<DialogContent side={side} size="lg" portalHost="pos" testID="register-panel">
				<DialogHeader className="flex-row items-center gap-3">
					<ToneDisc tone="muted" icon="register" size="sm" testID="register-panel-disc" />
					<View className="min-w-0 flex-1">
						<DialogTitle numberOfLines={1}>
							{registers.length === 1 ? t('register.register') : binding.registerName}
						</DialogTitle>
						<DialogDescription testID="register-panel-description">{description}</DialogDescription>
					</View>
					{/* The X-report is a glyph beside the figure it prints. `mr-3` clears the panel's own ×,
					    which sits 4 px past the header's `pr-ctl` reserve, and leaves the 8 between targets. */}
					{!blind && !!session && (
						<IconButton
							name="print"
							testID="register-panel-print"
							className="mr-3"
							accessibilityLabel={t('register.print_x_report')}
							onPress={() => attempt(print)}
						/>
					)}
				</DialogHeader>
				{figuresPending && (
					<Notice
						tone="info"
						testID="register-panel-figures-pending"
						className="mx-4"
						title={t('register.figures_after_sync')}
					/>
				)}
				{refused.length > 0 && (
					<Notice
						tone="bad"
						testID="register-panel-refused"
						className="mx-4"
						title={t('register.refused', { count: refused.length })}
						actions={[
							{
								label: t('register.retry'),
								testID: 'register-panel-retry-refused',
								onPress: () =>
									void attempt(() =>
										Promise.all(refused.map((row) => actions.retryMovement(row.id)))
									),
							},
						]}
					/>
				)}
				{session && (
					<View className="flex-row gap-2 px-4">
						{!blind && (
							<FigureTile
								testID="register-panel-drawer"
								label={t('register.in_the_drawer')}
								value={figuresPending ? '—' : format(Number(expected.cash ?? 0))}
								sub={figuresPending ? t('register.figures_after_sync') : undefined}
							/>
						)}
						{/* A seeded session's money is unknown until the baseline arrives (§ 4.9 rule 1); the
						    count is this device's and stays. */}
						<FigureTile
							testID="register-panel-session-sales"
							label={t('register.session_sales')}
							value={
								blind || !salesMoneyKnown
									? t('register.sales_count', { count: salesCount })
									: figuresPending
										? '—'
										: format(sessionSales)
							}
							sub={
								blind || !salesMoneyKnown
									? undefined
									: figuresPending
										? t('register.figures_after_sync')
										: t('register.sales_count', { count: salesCount })
							}
						/>
					</View>
				)}
				{session && (
					<View className="flex-row gap-2 px-4">
						{(['paid_in', 'paid_out', 'no_sale'] as const).map((type) => (
							<Tile
								key={type}
								testID={`register-panel-${type.replace('_', '-')}`}
								className="flex-1"
								disabled={session?.status !== 'open'}
								onPress={() => setMovement(type)}
								title={movementNames[type]}
							>
								<Icon
									name={
										type === 'paid_in' ? 'paidIn' : type === 'paid_out' ? 'paidOut' : 'cashDrawer'
									}
								/>
							</Tile>
						))}
					</View>
				)}
				<DialogBody className="gap-0">
					{terms && (
						<>
							<Derivation testID="register-panel-ledger" className="px-4 pt-2">
								<DerivationStep
									testID="register-panel-float"
									label={t('register.opened_suffix', { time: openedTime })}
									title={t('register.float')}
									trailing={trailing(figuresPending ? '—' : format(Number(terms.float)))}
									detail={figuresPending ? t('register.figures_after_sync') : undefined}
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
													action={{
														label: t('register.void'),
														testID: `movement-void-${row.id}`,
														disabled: session?.status !== 'open',
														onPress: () => void attempt(() => actions.voidMovement(row.id)),
													}}
												/>
											))}
										</DerivationStep>
									);
								})}
								{!blind && (
									<DerivationStep
										testID="register-panel-expected"
										state="result"
										label={t('register.expected_in_drawer')}
										trailing={trailing(figuresPending ? '—' : format(Number(terms.expected)))}
										detail={figuresPending ? t('register.figures_after_sync') : undefined}
									/>
								)}
							</Derivation>
							{others.length > 0 && (
								<>
									{/* A band, not a row: these tenders are not in the drawer. No count: a split
									    sale is both a cash and a card sale, so no subtraction names it honestly. */}
									<View className="h-band border-border mt-2 justify-center border-b px-2.5">
										<Text variant="caption">{t('register.other_tenders')}</Text>
									</View>
									{others.map(([method, value]) => (
										<View key={method} className={STATIC_ROW}>
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
					{!!error && (
						<Text variant="key" className="text-bad px-2.5 py-2">
							{error}
						</Text>
					)}
				</DialogBody>
				<DialogFooter
					size="lg"
					intent={{
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
					}}
				/>
				{movement && (
					<MovementSheet
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
