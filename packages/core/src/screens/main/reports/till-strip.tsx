import * as React from 'react';
import { View } from 'react-native';

import { format as formatDate, subDays } from 'date-fns';
import { useIsFocused } from 'expo-router/react-navigation';
import { useObservableState } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/button';
import { Icon } from '@wcpos/components/icon';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import type { WPCredentialsDocument } from '@wcpos/database';
import { fromMinor, toMinor } from '@wcpos/order-math';
import { useDocField } from '@wcpos/query';

import { useStoreSession } from '../../../contexts/app-state';
import { useTheme } from '../../../contexts/theme';
import { useT } from '../../../contexts/translations';
import { convertUTCStringToLocalDate, useLocalDate } from '../../../hooks/use-local-date';
import { inZone, useStoreDay, useViewedStore, zoneOptions } from '../../../hooks/use-store-day';
import { useRegisterSession } from '../../../services/register-session/use-register-session';
import { useSessionReport } from '../../../services/register-session/use-session-report';
import { useCurrencyFormat } from '../hooks/use-currency-format';
import { useReceiptDocument } from '../receipt/use-receipt-document';
import { normalizeClosureRow } from './closures/use-closure-rows';
import { useLastClosure } from './closures/use-last-closure';

type Term = [id: string, sign: string, label: string, amount: string];

export function TillStrip({ onOpenClosures }: { onOpenClosures: () => void }) {
	const t = useT();
	const { screenSize } = useTheme();
	const { session, binding, terms, expected, blind, lastClosure, sessionsOn } =
		useRegisterSession();
	const { store, site } = useStoreSession();
	const bound = sessionsOn && !!binding.registerId;
	const active = bound && (session?.status === 'open' || session?.status === 'counting');
	const remote = useLastClosure(
		bound && !active ? { id: binding.registerId!, name: binding.registerName ?? '' } : undefined,
		store.id,
		undefined,
		// A new local closure means the till closed here since the last read: read afresh.
		lastClosure?.id ?? ''
	);
	const authoritative = remote.online && remote.data.status === 'ready';
	// The server closure in the local row shape (GMT stamps, absent maps, flattened labels), or nothing usable.
	const remoteClosure = remote.data.closure
		? (normalizeClosureRow(remote.data.closure)[0] ?? null)
		: null;
	// A session opened on another device is open here too: the server says so (ledger closures 23).
	const remoteSession = !active && authoritative ? remote.data.session : null;
	const open = active || !!remoteSession;
	const liveSession = active ? session : remoteSession;
	// Open here or elsewhere, the last closure line is this device's own record of it.
	const closure = open
		? lastClosure
		: authoritative
			? remoteClosure
			: (lastClosure ?? remoteClosure);
	const unavailable =
		!open && (remote.online ? remote.unavailable : !lastClosure ? remote.unavailable : undefined);
	const { print } = useSessionReport(
		active || authoritative || !lastClosure ? undefined : lastClosure,
		!active,
		!active && authoritative ? (remoteClosure ?? undefined) : undefined
	);
	// The remote session's X-report goes through the receipt document, as the room's remote card prints it.
	// The till now: while this screen is focused a ready lookup is read again every minute and
	// on regaining focus, so a till opened on another device does not stay "Closed" here.
	const focused = useIsFocused();
	const { load: reload, data: remoteData } = remote;
	const ready = remoteData.status === 'ready';
	React.useEffect(() => {
		if (!focused || active || !bound || !ready) return;
		const id = setInterval(() => void reload(), 60_000);
		return () => clearInterval(id);
	}, [focused, active, bound, ready, reload]);
	const remoteReport = useReceiptDocument({
		document: remoteSession ? `xreport:${remoteSession.id}` : undefined,
		documentReady: !!remoteSession,
		previewEnabled: false,
		templateType: 'closure',
		storeId: store.id,
		autoPrintAllowed: false,
	});
	const source = React.useMemo(() => site.populate$('wp_credentials'), [site]);
	const cashiers = useObservableState(source, []) as WPCredentialsDocument[];
	const settings = useDocField(useViewedStore(store.id), (value) => value);
	const { format } = useCurrencyFormat({
		currency: settings?.currency,
		currencyPosition: settings?.currency_pos,
		decimalScale: settings?.price_num_decimals,
		decimalSeparator: settings?.price_decimal_sep,
		thousandSeparator: settings?.price_thousand_sep,
	});
	const { timezone } = useStoreDay(store.id);
	// Locale-aware (the cashier's language), in the store's zone.
	const { formatDate: formatLocal } = useLocalDate();
	const date = (value: string, pattern: string) =>
		formatLocal(inZone(timezone, convertUTCStringToLocalDate(value)), pattern);
	const today = formatDate(new Date(), 'yyyy-MM-dd', zoneOptions(timezone));
	const yesterday = formatDate(
		subDays(new Date(), 1, zoneOptions(timezone)),
		'yyyy-MM-dd',
		zoneOptions(timezone)
	);
	const day = closure && date(closure.closed_at, 'yyyy-MM-dd');
	const heading =
		day === today
			? t('common.today')
			: day === yesterday
				? t('common.yesterday')
				: closure
					? date(closure.closed_at, 'EEE d MMM')
					: '';
	const variance = Number(closure?.variance.cash ?? 0);
	const result = variance
		? `${format(Math.abs(variance))} ${t(variance < 0 ? 'register.short' : 'register.over')}`
		: t('reports.exact');
	const resultColor =
		variance < 0 ? 'text-destructive' : variance > 0 ? 'text-success' : 'text-muted-foreground';
	const rows: Term[] = [];
	const money = (amount: string) => format(Number(amount));
	if (bound && !blind) {
		if (active && terms) {
			rows.push(['till-term-float', '', t('reports.opening_float'), money(terms.float)]);
			if (terms.cashSales.count)
				rows.push([
					'till-term-cash-sales',
					'+',
					`${t('reports.cash_sales')} · ${terms.cashSales.count}`,
					money(terms.cashSales.amount),
				]);
			// Up to two paid-ins keep their notes; more fold into one term with a count, so a busy
			// day never pushes the actions off a phone.
			if (terms.paidIn.length > 2)
				rows.push([
					'till-term-paid-in',
					'+',
					`${t('register.paid_in')} · ${terms.paidIn.length}`,
					money(
						fromMinor(
							terms.paidIn.reduce((sum, row) => sum + toMinor(row.amount, 4), 0),
							4
						)
					),
				]);
			else
				terms.paidIn.forEach((row, index) =>
					rows.push([
						`till-term-paid-in-${index}`,
						'+',
						[t('register.paid_in'), row.note].filter(Boolean).join(' · '),
						money(row.amount),
					])
				);
			if (terms.paidOut.count)
				rows.push([
					'till-term-paid-out',
					'−',
					`${t('register.paid_out')} · ${terms.paidOut.note ?? terms.paidOut.count}`,
					money(terms.paidOut.amount),
				]);
			if (Number(terms.cashRefunds.amount))
				rows.push([
					'till-term-refunds',
					'−',
					`${t('reports.cash_refunds')} · ${terms.cashRefunds.count}`,
					money(terms.cashRefunds.amount),
				]);
			// The result is the hook's expected (the server's anchor when it has one), never a second derivation.
			rows.push([
				'till-expected',
				'=',
				t('reports.expected_in_drawer'),
				money(expected?.cash ?? terms.expected),
			]);
		} else if (remoteSession) {
			// Opened elsewhere: the movements are not on this device, so only the server's expected shows.
			if (remoteSession.expected?.cash)
				rows.push([
					'till-expected',
					'=',
					t('reports.expected_in_drawer'),
					money(remoteSession.expected.cash),
				]);
		} else if (!open && closure) {
			rows.push([
				'till-expected',
				'',
				t('reports.document.expected'),
				money(closure.expected.cash ?? '0'),
			]);
			rows.push(['till-counted', '·', t('register.counted'), money(closure.counted.cash ?? '0')]);
			rows.push(['till-result', '=', t('reports.drawer_result'), result]);
		}
	}
	const note =
		active && !blind && terms
			? [
					terms.noSales ? t('reports.no_sales_count', { count: terms.noSales }) : '',
					terms.voids ? t('reports.voids_count', { count: terms.voids }) : '',
				]
					.filter(Boolean)
					.join(' · ')
			: '';
	const phone = screenSize === 'sm';
	const stacked = screenSize === 'md' || rows.length > 4;
	const [busy, setBusy] = React.useState(false);
	const [error, setError] = React.useState('');
	const dispatch = async () => {
		setBusy(true);
		setError('');
		try {
			if (remoteSession) {
				if ((await remoteReport.print()) !== true) throw new Error('reports.reprint_failed');
			} else await print();
		} catch (error) {
			setError(
				error instanceof Error && error.message === 'reports.reprint_failed'
					? t('reports.reprint_failed')
					: String(error)
			);
		} finally {
			setBusy(false);
		}
	};
	const title = (
		<View testID="till-title" className="min-w-0 flex-1 gap-1">
			<View className="flex-row flex-wrap items-center gap-2">
				<Text className="font-semibold">
					{bound
						? binding.registerName || String(closure?.breakdowns.register_name ?? '')
						: t('reports.no_register')}
				</Text>
				{/* Only a status the strip knows: online, the server's answer; offline, the device's own session. */}
				{bound && (open || !remote.online || authoritative) && (
					<Text testID="till-status" className={open ? 'text-success' : 'text-muted-foreground'}>
						● {t(open ? 'reports.open' : 'register.closed')}
					</Text>
				)}
				{bound && (open || closure) && (
					<Text testID="till-since" className="text-muted-foreground">
						{open && liveSession
							? t('reports.since_by', {
									time: date(liveSession.opened_at_gmt, 'HH:mm'),
									name:
										cashiers.find((row) => row.id === liveSession.opened_by)?.display_name ??
										t('register.unknown_cashier'),
								})
							: t('reports.closed_at_by', {
									time: date(closure!.closed_at, 'HH:mm'),
									name: String(closure!.breakdowns.closed_by_name || t('register.unknown_cashier')),
								})}
					</Text>
				)}
			</View>
			{bound && closure && (
				<Text testID="till-last-closure" className="text-muted-foreground">
					{t('reports.last_closure', { n: `#${closure.server_number ?? closure.number}` })} ·{' '}
					{heading} {date(closure.closed_at, 'HH:mm')}
					{!blind && (
						<>
							{' '}
							·{' '}
							<Text testID="till-last-result" className={resultColor}>
								{result}
							</Text>
						</>
					)}
				</Text>
			)}
		</View>
	);
	const equation = rows.length > 0 && (
		<View
			testID="till-equation"
			className={phone ? 'gap-2' : 'flex-1 flex-row flex-wrap items-center justify-center gap-2'}
		>
			<View
				testID={phone ? 'till-ledger' : undefined}
				className={phone ? 'gap-1' : 'flex-row flex-wrap items-center justify-center gap-2'}
			>
				{rows.map(([id, sign, label, amount]) => {
					const primary = open && sign === '=';
					const color = primary
						? 'text-primary-foreground'
						: id === 'till-result'
							? resultColor
							: '';
					const chip = (
						<View
							testID={id}
							className={`rounded-md px-2.5 py-1 ${primary ? 'bg-primary' : 'bg-muted'} ${phone ? 'flex-1 flex-row items-center gap-2' : ''}`}
						>
							{phone && (
								<Text
									className={`w-4 text-center font-semibold ${primary ? color : 'text-muted-foreground'}`}
								>
									{sign}
								</Text>
							)}
							<Text
								className={`${primary ? color : 'text-muted-foreground'} ${phone ? 'flex-1' : 'text-sm'}`}
							>
								{label}
							</Text>
							<Text
								testID={`${id}-amount`}
								className={`font-semibold tabular-nums ${color} ${phone ? 'text-right' : ''}`}
							>
								{amount}
							</Text>
						</View>
					);
					return (
						<View key={id} className="flex-row items-center gap-2">
							{!phone && !!sign && (
								<Text className="text-muted-foreground font-semibold">{sign}</Text>
							)}
							{chip}
						</View>
					);
				})}
			</View>
			{!!note && (
				<Text testID="till-note" className="text-muted-foreground">
					{note}
				</Text>
			)}
		</View>
	);
	const actions = (
		<View
			testID="till-actions"
			className={`flex-row items-center gap-2 ${phone ? (bound && (open || closure) ? 'justify-between' : 'justify-end') : ''}`}
		>
			{bound && (open || closure) && (
				<Button
					testID={open ? 'till-xreport' : 'till-reprint'}
					variant="outline"
					className="min-h-12 flex-row items-center gap-1"
					disabled={busy || !!unavailable}
					onPress={dispatch}
				>
					<Icon name="printer" />
					<ButtonText>{t(open ? 'register.print_x_report' : 'reports.reprint')}</ButtonText>
				</Button>
			)}
			<IconButton
				name="chevronRight"
				testID="till-closures"
				aria-label={t('reports.closures')}
				className="h-12 w-12 items-center justify-center"
				onPress={onOpenClosures}
			/>
		</View>
	);
	return (
		<View testID="reports-till" className="bg-card mx-4 gap-3 rounded-md border px-4 py-3">
			{phone ? (
				<>
					{title}
					{equation}
				</>
			) : (
				<View className="flex-row items-center gap-5">
					{title}
					{!stacked && equation}
					{actions}
				</View>
			)}
			{!phone && stacked && equation}
			{bound && !!unavailable && (
				<Text testID="till-unavailable" className="text-muted-foreground">
					{unavailable}
				</Text>
			)}
			{!!error && (
				<Text testID="till-print-error" className="text-destructive">
					{error}
				</Text>
			)}
			{phone && actions}
		</View>
	);
}
