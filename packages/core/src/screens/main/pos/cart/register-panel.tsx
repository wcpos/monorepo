import * as React from 'react';
import { View } from 'react-native';

import { useRouter } from 'expo-router';
import { useObservableSuspense } from 'observable-hooks';

import { Icon } from '@wcpos/components/icon';
import { Button } from '@wcpos/components/button';
import { IconButton } from '@wcpos/components/icon-button';
import { cn } from '@wcpos/components/lib/utils';
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
import { Text } from '@wcpos/components/text';
import { Tile } from '@wcpos/components/tile';
import { Toast } from '@wcpos/components/toast';
import { fromMinor, toMinor } from '@wcpos/order-math';
import { useDocField } from '@wcpos/query';

import { credentialsListResource } from '../../../../hooks/user-db-list-resources';
import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { usePaymentMethods } from '../../hooks/use-payment-methods';
import { usePanelSide } from '../contexts/overlay-side';
import { MovementSheet } from './movement-sheet';
import { useSessionReport } from '../../../../services/register-session/use-session-report';

/**
 * The panel is one list, as the cashier sheet is: every row starts at the MenuRow's inset
 * (`px-2.5`) so the labels share one left edge, and each row draws the list's hairline.
 */
const STATIC_ROW =
	'min-h-row border-border flex-row items-center justify-between gap-2 border-b px-2.5';
/** A pressable row of the same list: the MenuRow's surface, squared, with the hairline. */
const ACTION_ROW = 'border-border rounded-none border-b';
const NOTE = 'text-muted-foreground px-2.5 py-1 text-sm';
const MUTED = 'text-muted-foreground';

function Opener({ id }: { id?: number | null }) {
	const { site } = useStoreSession();
	const credentials = useObservableSuspense(credentialsListResource(site));
	const t = useT();
	return (
		<Text>
			{credentials.find((row) => row.id === id)?.display_name ?? t('register.unknown_cashier')}
		</Text>
	);
}

export function RegisterPanel({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const {
		session,
		binding,
		expected,
		terms,
		salesCount,
		blind,
		movements,
		refusedMovements,
		lastClosure,
		actions,
	} = useRegisterSession();
	const [movement, setMovement] = React.useState<'paid_in' | 'paid_out' | 'no_sale' | null>(null);
	const [expanded, setExpanded] = React.useState<string | null>(null);
	const [error, setError] = React.useState('');
	const { format } = useCurrencyFormat();
	const { print } = useSessionReport();
	const { print: reprint } = useSessionReport(lastClosure, true);
	const t = useT();
	const { wpCredentials } = useStoreSession();
	const capabilities = useDocField(wpCredentials, (value) => value.capabilities);
	const reportsDenied = !!capabilities && !capabilities.includes('view_woocommerce_pos_reports');
	const router = useRouter();
	const side = usePanelSide('cart');
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
	// Refused cash keeps the pane open on its own: it is the only record that the money moved,
	// so it must not depend on there also being a current session or a written closure.
	if (!session && !lastClosure && refusedMovements.length === 0) return null;
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
	const openedTime = stamp
		? new Date(stamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
	/** One term of the derivation: the label with its muted count or note, the amount at the right. */
	const term = (label: string, suffix?: React.ReactNode, quiet?: boolean, strong?: boolean) => (
		<Text
			numberOfLines={1}
			className={cn('min-w-0 flex-1', quiet && MUTED, strong && 'font-semibold')}
		>
			{label}
			{suffix != null && suffix !== '' && <Text className={`${MUTED} text-sm`}> {suffix}</Text>}
		</Text>
	);
	const amount = (value: string, quiet?: boolean, strong?: boolean) =>
		!blind && (
			<Text className={cn('tabular-nums', quiet && MUTED, strong && 'font-semibold')}>{value}</Text>
		);
	/**
	 * A term whose movements sit under it: pressing it lists them, each with its Void. A term with
	 * nothing recorded on this device (a count the server's baseline carries) is a plain row.
	 */
	const fold = (
		type: 'paid_in' | 'paid_out' | 'no_sale',
		testID: string,
		label: React.ReactNode,
		value: React.ReactNode
	) => {
		const rows = activeMovements.filter((row) => row.type === type);
		const open = expanded === type && rows.length > 0;
		return (
			<React.Fragment key={type}>
				{rows.length > 0 ? (
					<MenuRow
						testID={testID}
						className={ACTION_ROW}
						onPress={() => setExpanded(open ? null : type)}
						label={label}
						trailing={
							<>
								{value}
								<Icon
									name={open ? 'chevronUp' : 'chevronDown'}
									size="sm"
									className="text-muted-foreground"
								/>
							</>
						}
					/>
				) : (
					<View testID={testID} className={STATIC_ROW}>
						{label}
						{value}
					</View>
				)}
				{open &&
					rows.map((row) => (
						<View key={row.id} className={STATIC_ROW}>
							<Text
								testID={`movement-row-${row.id}`}
								className={`flex-1 ${row.sync_status === 'failed' ? 'text-destructive' : ''}`}
							>
								{row.reason}
								{!blind && type !== 'no_sale'
									? ` · ${type === 'paid_out' ? minus(row.amount ?? 0) : format(Number(row.amount))}`
									: ''}
								{row.sync_status === 'failed' ? ` · ${t('register.refused_row')}` : ''}
							</Text>
							<Button
								variant="ghost"
								size="sm"
								testID={`movement-void-${row.id}`}
								disabled={session?.status !== 'open'}
								onPress={() => attempt(() => actions.voidMovement(row.id))}
							>
								{t('register.void')}
							</Button>
						</View>
					))}
			</React.Fragment>
		);
	};
	const noteOf = (count: number, note?: string | null) =>
		count === 1 && note ? `1 · ${note}` : count > 0 ? count : undefined;
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent side={side} size="lg" portalHost="pos" testID="register-panel">
				{/* The header block: on the phone the panel is a page, and its padding comes from here. */}
				<DialogHeader className="flex-row items-start gap-2">
					<View className="min-w-0 flex-1 gap-1.5">
						<DialogTitle testID="register-panel-amount" className="text-amt tabular-nums">
							{blind ? binding.registerName : format(Number(expected.cash ?? 0))}
						</DialogTitle>
						{/* The identity line under the figure, in the order modal's recipe: muted, small. */}
						{blind ? (
							<DialogDescription>
								{t('register.sales_count', { count: salesCount })}
							</DialogDescription>
						) : (
							<DialogDescription>
								{t('register.in_the_drawer')} · {binding.registerName}
								{openedTime && (
									<>
										{' · '}
										{t('register.opened_at_by', { time: openedTime })}{' '}
										<React.Suspense fallback={null}>
											<Opener id={session?.opened_by} />
										</React.Suspense>
									</>
								)}
							</DialogDescription>
						)}
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
				<View className="flex-row gap-2 px-4">
					{(['paid_in', 'paid_out', 'no_sale'] as const).map((type) => (
						<Tile
							key={type}
							testID={`register-panel-${type.replace('_', '-')}`}
							className="flex-1"
							disabled={session?.status !== 'open'}
							onPress={() => setMovement(type)}
						>
							<Icon
								name={
									type === 'paid_in' ? 'arrowDown' : type === 'paid_out' ? 'arrowUp' : 'register'
								}
							/>
							<Text numberOfLines={1} className="font-medium">
								{t(`register.${type}`)}
							</Text>
						</Tile>
					))}
				</View>
				<DialogBody className="gap-0">
					{/* The drawer's derivation in the order every till uses, ending in its sum line; a zero
					    term goes quiet rather than vanishing. Blind cashiers get the labels and counts. */}
					{terms && (
						<>
							<View className={STATIC_ROW}>
								{term(
									t('register.float'),
									openedTime && t('register.opened_suffix', { time: openedTime })
								)}
								{amount(format(Number(terms.float)))}
							</View>
							<View className={STATIC_ROW}>
								{term(t('register.cash_sales'), terms.cashSales.count)}
								{amount(format(Number(terms.cashSales.amount)))}
							</View>
							<View className={STATIC_ROW}>
								{term(
									t('register.cash_refunds'),
									noteOf(terms.cashRefunds.count),
									!Number(terms.cashRefunds.amount)
								)}
								{amount(minus(terms.cashRefunds.amount), !Number(terms.cashRefunds.amount))}
							</View>
							{fold(
								'paid_in',
								'register-panel-paid-in-row',
								term(
									t('register.paid_in'),
									noteOf(terms.paidIn.length, terms.paidIn[0]?.note),
									!Number(paidIn)
								),
								amount(format(Number(paidIn)), !Number(paidIn))
							)}
							{fold(
								'paid_out',
								'register-panel-movements',
								term(
									t('register.paid_out'),
									noteOf(terms.paidOut.count, terms.paidOut.note),
									!Number(terms.paidOut.amount)
								),
								amount(minus(terms.paidOut.amount), !Number(terms.paidOut.amount))
							)}
							{terms.noSales > 0 &&
								fold(
									'no_sale',
									'register-panel-no-sales',
									term(t('register.no_sales'), undefined, true),
									<Text className={`${MUTED} tabular-nums`}>{terms.noSales}</Text>
								)}
							{!blind && (
								<View testID="register-panel-expected" className={STATIC_ROW}>
									{term(t('register.expected_in_drawer'), undefined, false, true)}
									{amount(format(Number(terms.expected)), false, true)}
								</View>
							)}
							{others.length > 0 && (
								<>
									{/* A band, not a row: these tenders are not in the drawer. No count: a split
									    sale is both a cash and a card sale, so no subtraction names it honestly. */}
									<View className="h-band border-border mt-2 justify-center border-b px-2.5">
										<Text className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
											{t('register.other_tenders')}
										</Text>
									</View>
									{others.map(([method, value]) => (
										<View key={method} className={STATIC_ROW}>
											{term(tenderLabel(method))}
											{amount(format(Number(value)))}
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
								onPress={() => {
									router.push({
										pathname: '/reports',
										params: {
											closureId: lastClosure.id,
											businessDay: lastClosure.business_day,
											openedAt: lastClosure.opened_at,
											registerId: lastClosure.register_id,
										},
									});
									onOpenChange(false);
								}}
								label={`${t('register.closure_written_n', {
									n: lastClosure.server_number ?? lastClosure.number,
								})}${blind ? '' : ` · ${format(Number(lastClosure.counted.cash))}`}`}
								trailing={<Icon name="chevronRight" size="sm" className="text-muted-foreground" />}
							/>
							{blind && (
								<Text testID="register-panel-closure-restricted" className={NOTE}>
									{t('register.closure_blind_restricted')}
								</Text>
							)}
							{!lastClosure.synced_rows_at ? (
								<Text testID="closure-unsynced" className={NOTE}>
									{t('register.unsynced')}
								</Text>
							) : !blind ? (
								<MenuRow
									testID="closure-reprint"
									onPress={() => attempt(reprint)}
									label={t('register.reprint_copy')}
									trailing={<Icon name="print" size="sm" className="text-muted-foreground" />}
								/>
							) : null}
							{lastClosure.sync_status === 'failed' && (
								<Text testID="closure-sync-error" className="text-destructive px-2.5 py-1 text-sm">
									{lastClosure.sync_error}
								</Text>
							)}
							{lastClosure.server_findings &&
								Object.keys(lastClosure.server_findings).length > 0 && (
									<Text className={NOTE}>{t('register.listed_in_health')}</Text>
								)}
						</View>
					)}
					{!!error && <Text className="text-destructive px-2.5 py-2 text-sm">{error}</Text>}
				</DialogBody>
				<DialogFooter
					size="lg"
					intent={{
						label: t('register.close_register'),
						testID: 'register-panel-close-register',
						disabled: !session,
						onPress: () =>
							void attempt(async () => {
								await actions.startCounting();
								onOpenChange(false);
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
								title: `${t(`register.${type}`)}${blind || type === 'no_sale' ? '' : ` ${format(Number(amount))}`}`,
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
