import * as React from 'react';
import { View } from 'react-native';

import { filter } from 'rxjs';
import { format as formatDate } from 'date-fns/format';
import { useObservableState } from 'observable-hooks';

import { observeSiteCredentials, PENDING_USER_DB_READ } from '@wcpos/query/user-db';
import { ListRow } from '@wcpos/components/list-row';
import { Button } from '@wcpos/components/button';
import { Text } from '@wcpos/components/text';
import { useDocField } from '@wcpos/query';
import { readClosure, type RegisterSessionRow } from '@wcpos/query/register-session';

import { convertUTCStringToLocalDate } from '../../../../hooks/use-local-date';
import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useStoreDay, useViewedStore, zoneOptions } from '../../../../hooks/use-store-day';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { useSessionReport } from '../../../../services/register-session/use-session-report';
import { useReceiptDocument } from '../../receipt/use-receipt-document';
import { PrintSheet } from '../../receipt/print-sheet';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { useLastClosure } from './use-last-closure';

import type { SessionCardData, SessionSummary } from './use-last-closure';

export type { SessionCardData, SessionSummary } from './use-last-closure';
type BatchProps = {
	summary?: SessionCardData;
	reload?: () => void;
	onSessions?: (sessions: SessionSummary[]) => void;
	/** The scope's cashier; a session another cashier opened draws no row (Codex, #3048). */
	cashier?: number;
};

export function SessionCard(batch: BatchProps) {
	const { onSessions } = batch;
	const { store } = useStoreSession();
	const data = useRegisterSession();
	const active = data.session?.status === 'open' || data.session?.status === 'counting';
	const [sheetOpen, setSheetOpen] = React.useState(false);
	const { print, doc } = useSessionReport(
		active ? undefined : data.lastClosure,
		!active,
		undefined,
		sheetOpen || !batch.summary
	);
	// Publish the local session already resolved by the register hook; closed registers use the remote result.
	React.useEffect(() => {
		if (active || !data.binding.registerId)
			// eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-data-to-parent -- The room aggregates existing reads; the slice explicitly preserves their owners.
			onSessions?.(active && data.session ? [data.session] : []);
	}, [active, data.session, data.binding.registerId, onSessions]);
	if (!active && data.binding.registerId) {
		return (
			<RemoteSessionCard
				{...batch}
				key={`${store.id}:${data.binding.registerId}`}
				register={{ id: data.binding.registerId, name: data.binding.registerName ?? '' }}
				storeId={store.id}
				localCard={
					data.lastClosure
						? (reason) => (
								<SessionCardContent
									{...data}
									print={print}
									doc={doc}
									sheetOpen={sheetOpen}
									onOpenChange={setSheetOpen}
									cashier={batch.cashier}
									unavailableReason={reason}
								/>
							)
						: undefined
				}
			/>
		);
	}
	return (
		<SessionCardContent
			{...data}
			print={print}
			doc={doc}
			sheetOpen={sheetOpen}
			onOpenChange={setSheetOpen}
			cashier={batch.cashier}
		/>
	);
}
function SessionCardContent({
	session,
	binding,
	expected,
	salesCount,
	blind,
	doc,
	sheetOpen,
	onOpenChange,
	print,
	unavailable = false,
	unavailableReason,
	storeId,
	cashier,
}: {
	session: Pick<RegisterSessionRow, 'status' | 'opened_at_gmt' | 'opened_by'> | null;
	binding: { registerName: string | null };
	expected?: Record<string, string>;
	salesCount?: number;
	blind: boolean;
	print: () => Promise<unknown>;
	doc: ReturnType<typeof useReceiptDocument>;
	sheetOpen: boolean;
	onOpenChange: (open: boolean) => void;
	unavailable?: boolean;
	unavailableReason?: string;
	storeId?: number;
	cashier?: number;
}) {
	const active = session?.status === 'open' || session?.status === 'counting';
	const { site } = useStoreSession();
	const source = React.useMemo(
		() => observeSiteCredentials(site).pipe(filter((value) => value !== PENDING_USER_DB_READ)),
		[site]
	);
	const cashiers = useObservableState(source, []);
	const { timezone } = useStoreDay(storeId);
	const viewedStore = useViewedStore(storeId);
	const settings = useDocField(viewedStore, (value) => value);
	const { format } = useCurrencyFormat({
		currency: settings?.currency,
		currencyPosition: settings?.currency_pos,
		decimalScale: settings?.price_num_decimals,
		decimalSeparator: settings?.price_decimal_sep,
		thousandSeparator: settings?.price_thousand_sep,
	});
	const t = useT();
	const [error, setError] = React.useState('');
	const [busy, setBusy] = React.useState(false);
	const dispatch = async () => {
		setBusy(true);
		setError('');
		try {
			await print();
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
	if (!active || (cashier !== undefined && session?.opened_by !== cashier)) return null;
	return (
		<>
			<ListRow
				testID="reports-session-card"
				className="bg-background"
				trailing={
					<>
						{!blind && expected && (
							<View className="items-end">
								<Text testID="session-expected" className="tabular-nums">
									{format(Number(expected.cash ?? 0))}
								</Text>
								<Text variant="key">{t('register.expected_label')}</Text>
							</View>
						)}
						<Button
							testID="reports-session-print"
							variant="outline"
							size="sm"
							leftIcon="print"
							disabled={busy || unavailable || !!unavailableReason}
							onPress={() => onOpenChange(true)}
						>
							{t('register.print_x_report')}
						</Button>
					</>
				}
			>
				<Text>
					<Text className="text-success">●</Text> {t('reports.open')} · {binding.registerName}
				</Text>
				<Text variant="key">
					{t('reports.since_by', {
						time: formatDate(
							convertUTCStringToLocalDate(session.opened_at_gmt),
							'HH:mm',
							zoneOptions(timezone)
						),
						name:
							cashiers?.find((row) => row.id === session.opened_by)?.display_name ??
							t('register.unknown_cashier'),
					})}
					{salesCount !== undefined && ` · ${t('register.sales_count', { count: salesCount })}`}
				</Text>
			</ListRow>
			{(unavailable || unavailableReason) && (
				<Text testID="session-unavailable">
					{unavailableReason ?? t('reports.unavailable_offline')}
				</Text>
			)}
			<PrintSheet
				open={sheetOpen}
				onOpenChange={onOpenChange}
				doc={doc}
				title={active ? t('register.x_report') : t('reports.document.closure')}
				description={binding.registerName ?? ''}
				printLabel={active ? t('register.print_x_report') : t('register.print_closure')}
				error={error || doc.documentError?.message || null}
				onPrint={dispatch}
				testID="reports-session-print-sheet"
			/>
		</>
	);
}

// Remote cards are keyed by store/register in the room; never bind the till while browsing.
export function RemoteSessionCard({
	register,
	storeId,
	localCard,
	summary,
	reload,
	onSessions,
	cashier,
}: BatchProps & {
	register: { id: string; name: string };
	storeId?: number;
	localCard?: (unavailableReason?: string) => React.ReactNode;
}) {
	const { data, online, load, unavailable } = useLastClosure(register, storeId, summary);
	// Report the existing lookup result without introducing another session read.
	React.useEffect(() => {
		// eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-data-to-parent -- Publish the existing lookup without moving or duplicating its reads.
		onSessions?.(data.session ? [data.session] : []);
	}, [data.session, onSessions]);
	const { wpCredentials, storeDB } = useStoreSession();
	const capabilities = useDocField(wpCredentials, (row) => row.capabilities);
	const t = useT();
	const closureId = data.closure?.server_closure_id ?? data.closure?.id;
	const getLocalClosure = React.useCallback(
		async () => (closureId ? readClosure(storeDB, { serverClosureId: closureId }) : null),
		[storeDB, closureId]
	);
	const document = data.session
		? `xreport:${data.session.id}`
		: data.closure
			? `closure:${closureId}`
			: undefined;
	const [sheetOpen, setSheetOpen] = React.useState(false);
	const report = useReceiptDocument({
		document,
		getLocalClosure,
		previewEnabled: sheetOpen || !summary,
		documentReady: !!document && online,
		templateType: 'closure',
		storeId,
		autoPrintAllowed: false,
		isReprint: !!data.closure,
	});
	return (
		<View testID={`remote-session-${register.id}`} className={!online ? 'opacity-50' : ''}>
			{localCard && (!online || data.status !== 'ready') ? (
				localCard(online ? unavailable : undefined)
			) : data.status === 'ready' ? (
				<SessionCardContent
					storeId={storeId}
					doc={report}
					sheetOpen={sheetOpen}
					onOpenChange={setSheetOpen}
					cashier={cashier}
					session={data.session}
					binding={{ registerName: register.name }}
					expected={data.session?.expected ?? (summary ? undefined : {})}
					salesCount={data.session?.sales_count ?? (summary ? undefined : 0)}
					blind={!capabilities?.includes('view_woocommerce_pos_reports')}
					unavailable={!online}
					print={async () => {
						if ((await report.print()) !== true) throw new Error(t('reports.reprint_failed'));
					}}
				/>
			) : null}
			{data.status !== 'ready' && (online || !localCard) && (
				<ListRow
					size="sm"
					trailing={
						online &&
						data.status === 'error' && (
							<Button
								testID={`session-retry-${register.id}`}
								variant="outline"
								size="sm"
								// The press event must not reach `load` as its options object.
								onPress={() => (reload ?? load)()}
							>
								{t('common.retry')}
							</Button>
						)
					}
				>
					<Text
						className="text-muted-foreground"
						testID={`session-${online ? data.status : 'unavailable'}`}
					>
						{unavailable}
					</Text>
				</ListRow>
			)}
		</View>
	);
}
