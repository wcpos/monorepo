import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { useObservableSuspense } from 'observable-hooks';

import { Button } from '@wcpos/components/button';
import { Dialog, DialogContent, DialogTitle } from '@wcpos/components/dialog';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';
import type { WPCredentialsDocument } from '@wcpos/database';

import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { usePOSOverlaySide } from '../contexts/overlay-side';
import { MovementSheet, useSessionReport } from './movement-sheet';

function Opener({ id }: { id?: number | null }) {
	const { site } = useStoreSession();
	const credentials = useObservableSuspense(
		site.populateResource('wp_credentials')
	) as WPCredentialsDocument[];
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
	const { session, binding, expected, salesCount, blind, movements, lastClosed, actions } =
		useRegisterSession();
	const [movement, setMovement] = React.useState<'paid_in' | 'paid_out' | 'no_sale' | null>(null);
	const [expanded, setExpanded] = React.useState(false);
	const [highlight, setHighlight] = React.useState(false);
	const [error, setError] = React.useState('');
	const { format } = useCurrencyFormat();
	const { print } = useSessionReport();
	const t = useT();
	const side = usePOSOverlaySide();
	const attempt = async (action: () => Promise<unknown>) => {
		try {
			await action();
		} catch (e) {
			setError(String(e));
		}
	};
	if (!session) return null;
	const activeMovements = movements.filter(
		(row) =>
			row.type !== 'void' && !row.voided_by && !movements.some((entry) => entry.voids === row.id)
	);
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent side={side} portalHost="pos" testID="register-panel">
				<DialogTitle testID="register-panel-amount" className="text-[32px] tabular-nums">
					{blind ? binding.registerName : format(Number(expected.cash ?? 0))}
				</DialogTitle>
				{blind ? (
					<Text>{t('register.sales_count', { count: salesCount })}</Text>
				) : (
					<Text>
						{t('register.in_the_drawer')} · {binding.registerName} ·{' '}
						{t('register.opened_at_by', {
							time: new Date(session.opened_at_gmt).toLocaleTimeString([], {
								hour: '2-digit',
								minute: '2-digit',
							}),
						})}{' '}
						<React.Suspense fallback={null}>
							<Opener id={session.opened_by} />
						</React.Suspense>
					</Text>
				)}
				<View className="flex-row gap-2">
					{(['paid_in', 'paid_out', 'no_sale'] as const).map((type) => (
						<Button
							key={type}
							testID={`register-panel-${type.replace('_', '-')}`}
							className="min-h-14 flex-1"
							variant="outline"
							disabled={session.status !== 'open'}
							onPress={() => setMovement(type)}
						>
							{t(`register.${type}`)}
						</Button>
					))}
				</View>
				<ScrollView>
					{Object.entries({ cash: '0', card: '0', ...expected }).map(([method, amount]) => (
						<View key={method} className="min-h-11 flex-row items-center justify-between">
							<Text>
								{method === 'cash'
									? t('register.cash')
									: method === 'card'
										? t('register.card')
										: method}
							</Text>
							{!blind && <Text className="tabular-nums">{format(Number(amount))}</Text>}
						</View>
					))}
					<Button
						testID="register-panel-movements"
						variant="ghost"
						className={`min-h-11 ${highlight ? 'bg-success/10' : ''}`}
						onPress={() => setExpanded(!expanded)}
					>
						{t('register.paid_in_out')}
					</Button>
					{expanded &&
						activeMovements.map((row) => (
							<View key={row.id} className="min-h-11 flex-row items-center gap-2">
								<Text className="flex-1">
									{t(`register.${row.type}`)}
									{!blind ? ` · ${format(Number(row.amount))} · ${row.reason}` : ''}
								</Text>
								<Button
									variant="ghost"
									className="min-h-11"
									testID={`movement-void-${row.id}`}
									disabled={session.status !== 'open'}
									onPress={() => attempt(() => actions.voidMovement(row.id))}
								>
									{t('register.void')}
								</Button>
							</View>
						))}
					{!blind && (
						<Button
							testID="register-panel-print"
							className="min-h-11"
							variant="ghost"
							onPress={() => attempt(print)}
						>
							{t('register.print_x_report')}
						</Button>
					)}
					{lastClosed && (
						<Text className="min-h-11">
							{blind
								? t('register.last_count_blind')
								: t('register.last_count', {
										amount: format(Number(lastClosed.counted?.cash ?? 0)),
										date: new Date(lastClosed.closed_at_gmt!).toLocaleDateString(),
									})}
						</Text>
					)}
				</ScrollView>
				{!!error && <Text>{error}</Text>}
				<Button
					testID="register-panel-close"
					variant="outline"
					className="min-h-14"
					onPress={() =>
						attempt(async () => {
							await actions.startCounting();
							onOpenChange(false);
						})
					}
				>
					{t('register.close_register')}
				</Button>
				{movement && (
					<MovementSheet
						type={movement}
						onOpenChange={(value) => {
							if (!value) setMovement(null);
						}}
						onDone={(id, type, amount) => {
							setHighlight(true);
							setTimeout(() => setHighlight(false), 200);
							Toast.show({
								title: `${t(`register.${type}`)}${blind || type === 'no_sale' ? '' : ` ${format(Number(amount))}`}`,
								action: (
									<Button
										testID="toast-undo"
										variant="ghost"
										className="min-h-11"
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
