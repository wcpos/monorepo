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
import { useStoreDay, zoneOptions } from '../../../../hooks/use-store-day';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { useSessionReport } from '../../../../services/register-session/use-session-report';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';
import { useReceiptDocument } from '../../receipt/use-receipt-document';
import { useCurrencyFormat } from '../../hooks/use-currency-format';

export function SessionCard() {
	const data = useRegisterSession();
	const active = data.session?.status === 'open' || data.session?.status === 'counting';
	const { print } = useSessionReport(active ? undefined : data.lastClosure, !active);
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
}: {
	session: Pick<RegisterSessionRow, 'status' | 'opened_at_gmt' | 'opened_by'> | null;
	binding: { registerName: string | null };
	expected: Record<string, string>;
	salesCount: number;
	blind: boolean;
	lastClosure: unknown;
	print: () => Promise<unknown>;
	unavailable?: boolean;
}) {
	const active = session?.status === 'open' || session?.status === 'counting';
	const { site } = useStoreSession();
	const source = React.useMemo(() => site.populate$('wp_credentials'), [site]);
	const cashiers = useObservableState(source, []) as WPCredentialsDocument[];
	const { timezone } = useStoreDay();
	const { format } = useCurrencyFormat();
	const t = useT();
	const [error, setError] = React.useState('');
	const [busy, setBusy] = React.useState(false);
	const dispatch = async () => {
		setBusy(true);
		setError('');
		try {
			await print();
		} catch (error) {
			setError(String(error));
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
					<Text>{t('register.sales_count', { count: salesCount })}</Text>
					{!blind && (
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
					disabled={busy || unavailable}
					onPress={dispatch}
				>
					{t(active ? 'register.print_x_report' : 'reports.reprint')}
				</Button>
			)}
			{unavailable && <Text testID="session-unavailable">{t('reports.unavailable_offline')}</Text>}
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
}: {
	register: { id: string; name: string };
	storeId?: number;
}) {
	const http = useRestHttpClient();
	const online = useOnlineStatus().status === 'online-website-available';
	const { wpCredentials } = useStoreSession();
	const capabilities = useDocField(wpCredentials, (row) => row.capabilities);
	const t = useT();
	type Session = RegisterSessionRow & { expected?: Record<string, string>; sales_count?: number };
	const [data, setData] = React.useState<{
		session: Session | null;
		closure: ClosureRow | null;
		status: string;
	}>({ session: null, closure: null, status: 'idle' });
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
			const session = lists.flatMap((result) => result.data as Session[])[0];
			const detail = await http.get(session ? `sessions/${session.id}` : 'closures/last', {
				params,
			});
			setData({
				session: session ? (detail.data as Session) : null,
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
	// Read once on activation. Disconnect retains the card; failed reads require the Retry action.
	React.useEffect(() => {
		// eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- Initial external read on mount, not a state-change event.
		if (data.status === 'idle') void load();
	}, [data.status, load]);
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
			{data.status === 'ready' ? (
				<SessionCardContent
					session={data.session}
					binding={{ registerName: register.name }}
					expected={data.session?.expected ?? {}}
					salesCount={data.session?.sales_count ?? 0}
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
					onPress={load}
				>
					{t('common.retry')}
				</Button>
			)}
		</View>
	);
}
