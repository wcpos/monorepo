import * as React from 'react';
import { View } from 'react-native';

import { format as formatDate } from 'date-fns';
import { useObservableState } from 'observable-hooks';

import { Button } from '@wcpos/components/button';
import { Text } from '@wcpos/components/text';
import type { WPCredentialsDocument } from '@wcpos/database';

import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useStoreDay, zoneOptions } from '../../../../hooks/use-store-day';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { useSessionReport } from '../../../../services/register-session/use-session-report';
import { useCurrencyFormat } from '../../hooks/use-currency-format';

export function SessionCard() {
	const { session, binding, expected, salesCount, blind, lastClosure } = useRegisterSession();
	const active = session?.status === 'open' || session?.status === 'counting';
	const { print } = useSessionReport(active ? undefined : lastClosure, !active);
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
							time: formatDate(new Date(session.opened_at_gmt), 'HH:mm', zoneOptions(timezone)),
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
			{(active || lastClosure) && (
				<Button
					testID="reports-session-print"
					variant="outline"
					className="min-h-12 self-start"
					disabled={busy}
					onPress={dispatch}
				>
					{t(active ? 'register.print_x_report' : 'reports.reprint')}
				</Button>
			)}
			{!!error && (
				<Text testID="session-print-error" className="text-destructive">
					{error}
				</Text>
			)}
		</View>
	);
}
