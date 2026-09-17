import * as React from 'react';
import { View } from 'react-native';

import { format as formatDate } from 'date-fns';
import { useObservableState } from 'observable-hooks';
import get from 'lodash/get';

import { Button } from '@wcpos/components/button';
import { Text } from '@wcpos/components/text';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { useDocField } from '@wcpos/query';
import type { ClosureRow, RegisterSessionRow, WPCredentialsDocument } from '@wcpos/database';

import { convertUTCStringToLocalDate } from '../../../../hooks/use-local-date';
import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useStoreDay, useViewedStore, zoneOptions } from '../../../../hooks/use-store-day';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { useSessionReport } from '../../../../services/register-session/use-session-report';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';
import { useReceiptDocument } from '../../receipt/use-receipt-document';
import { useCurrencyFormat } from '../../hooks/use-currency-format';

export type SessionSummary = RegisterSessionRow & {
	expected?: Record<string, string>;
	sales_count?: number;
};
export type SessionCardData = {
	session: SessionSummary | null;
	closure: ClosureRow | null;
	status: string;
};
type BatchProps = { summary?: SessionCardData; reload?: () => void };

export function SessionCard(batch: BatchProps) {
	const { store } = useStoreSession();
	const data = useRegisterSession();
	const active = data.session?.status === 'open' || data.session?.status === 'counting';
	const { print } = useSessionReport(active ? undefined : data.lastClosure, !active);
	if (!active && data.binding.registerId) {
		return (
			<RemoteSessionCard
				{...batch}
				key={`${store.id}:${data.binding.registerId}`}
				register={{ id: data.binding.registerId, name: data.binding.registerName ?? '' }}
				storeId={store.id}
				localCard={
					data.lastClosure
						? (reason) => <SessionCardContent {...data} print={print} unavailableReason={reason} />
						: undefined
				}
			/>
		);
	}
	return <SessionCardContent {...data} print={print} />;
}
function SessionCardContent({
	session,
	binding,
	expected,
	salesCount,
	blind,
	lastClosure,
	print,
	unavailable = false,
	unavailableReason,
	storeId,
}: {
	session: Pick<RegisterSessionRow, 'status' | 'opened_at_gmt' | 'opened_by'> | null;
	binding: { registerName: string | null };
	expected?: Record<string, string>;
	salesCount?: number;
	blind: boolean;
	lastClosure: unknown;
	print: () => Promise<unknown>;
	unavailable?: boolean;
	unavailableReason?: string;
	storeId?: number;
}) {
	const active = session?.status === 'open' || session?.status === 'counting';
	const { site } = useStoreSession();
	const source = React.useMemo(() => site.populate$('wp_credentials'), [site]);
	const cashiers = useObservableState(source, []) as WPCredentialsDocument[];
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
	return (
		<View testID="reports-session-card" className="bg-card gap-3 rounded-md border p-4">
			<Text className="font-semibold">
				{binding.registerName} · {t(active ? 'reports.open' : 'reports.register_closed')}
			</Text>
			{active && (
				<>
					<Text>
						{t('register.opened_at_by', {
							time: formatDate(
								convertUTCStringToLocalDate(session.opened_at_gmt),
								'HH:mm',
								zoneOptions(timezone)
							),
						})}{' '}
						{cashiers?.find((row) => row.id === session.opened_by)?.display_name ??
							t('register.unknown_cashier')}
					</Text>
					{salesCount !== undefined && (
						<Text>{t('register.sales_count', { count: salesCount })}</Text>
					)}
					{!blind && expected && (
						<Text testID="session-expected" className="text-2xl tabular-nums">
							{t('register.expected', { amount: format(Number(expected.cash ?? 0)) })}
						</Text>
					)}
				</>
			)}
			{(active || !!lastClosure) && (
				<Button
					testID="reports-session-print"
					variant="outline"
					className="min-h-12 self-start"
					disabled={busy || unavailable || !!unavailableReason}
					onPress={dispatch}
				>
					{t(active ? 'register.print_x_report' : 'reports.reprint')}
				</Button>
			)}
			{(unavailable || unavailableReason) && (
				<Text testID="session-unavailable">
					{unavailableReason ?? t('reports.unavailable_offline')}
				</Text>
			)}
			{!!error && (
				<Text testID="session-print-error" className="text-destructive">
					{error}
				</Text>
			)}
		</View>
	);
}

// Remote cards are keyed by store/register in the room; never bind the till while browsing.
export function RemoteSessionCard({
	register,
	storeId,
	localCard,
	summary,
	reload,
}: BatchProps & {
	register: { id: string; name: string };
	storeId?: number;
	localCard?: (unavailableReason?: string) => React.ReactNode;
}) {
	const http = useRestHttpClient();
	const online = useOnlineStatus().status === 'online-website-available';
	const { wpCredentials } = useStoreSession();
	const capabilities = useDocField(wpCredentials, (row) => row.capabilities);
	const t = useT();
	const [localData, setData] = React.useState<SessionCardData>({
		session: null,
		closure: null,
		status: 'idle',
	});
	const data = summary ?? localData;
	const load = React.useCallback(async () => {
		if (!online) return;
		setData((d) => ({ ...d, status: 'loading' }));
		try {
			const params = { register_id: register.id, store_id: storeId || null };
			const lists = await Promise.all(
				['open', 'counting'].map((status) =>
					http.get('sessions', { params: { ...params, status } })
				)
			);
			const session = lists.flatMap((result) => result.data as SessionSummary[])[0];
			const detail = await http.get(session ? `sessions/${session.id}` : 'closures/last', {
				params,
			});
			setData({
				session: session ? (detail.data as SessionSummary) : null,
				closure: session ? null : (detail.data as ClosureRow | null),
				status: 'ready',
			});
		} catch (error) {
			setData((d) => ({
				...d,
				status: get(error, 'response.status') === 403 ? 'denied' : 'error',
			}));
		}
	}, [http, online, register.id, storeId]);
	const wasOnline = React.useRef(false);
	// External connectivity changes refresh stale remote cards; failures still use Retry.
	React.useEffect(() => {
		const reconnected = online && !wasOnline.current;
		wasOnline.current = online;
		// eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- Activation/reconnect reads external server state.
		if (!summary && (data.status === 'idle' || reconnected)) void load();
	}, [data.status, load, online, summary]);
	const document = data.session
		? `xreport:${data.session.id}`
		: data.closure
			? `closure:${data.closure.id}`
			: undefined;
	const report = useReceiptDocument({
		document,
		documentReady: !!document && online,
		templateType: 'closure',
		storeId,
		autoPrintAllowed: false,
		isReprint: !!data.closure,
	});
	return (
		<View testID={`remote-session-${register.id}`} className={!online ? 'opacity-50' : ''}>
			{localCard && (!online || data.status !== 'ready') ? (
				localCard(
					online
						? t(
								data.status === 'denied'
									? 'reports.no_access'
									: data.status === 'error'
										? 'reports.load_failed'
										: 'common.loading'
							)
						: undefined
				)
			) : data.status === 'ready' ? (
				<SessionCardContent
					storeId={storeId}
					session={data.session}
					binding={{ registerName: register.name }}
					expected={data.session?.expected ?? (summary ? undefined : {})}
					salesCount={data.session?.sales_count ?? (summary ? undefined : 0)}
					blind={!capabilities?.includes('view_woocommerce_pos_reports')}
					lastClosure={data.closure}
					unavailable={!online}
					print={async () => {
						if ((await report.print()) !== true) throw new Error(t('reports.reprint_failed'));
					}}
				/>
			) : (
				<Text testID={`session-${online ? data.status : 'unavailable'}`}>
					{t(
						!online
							? 'reports.unavailable_offline'
							: data.status === 'denied'
								? 'reports.no_access'
								: data.status === 'error'
									? 'reports.load_failed'
									: 'common.loading'
					)}
				</Text>
			)}
			{online && data.status === 'error' && (
				<Button
					testID={`session-retry-${register.id}`}
					variant="outline"
					className="min-h-12"
					onPress={reload ?? load}
				>
					{t('common.retry')}
				</Button>
			)}
		</View>
	);
}
